import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { applyLikeRankAdjustment, indexVideosById } from "../lib/ranking-adjustments.js";
import { positiveDimensionTags } from "../lib/dimension-tags.js";
import { computeCompositeFromDimensions } from "../lib/score-composite.js";
import { resolveWordCount } from "../lib/content-length.js";
import { isScoredRanking } from "../lib/score-bands.js";
import { appliesDurationLimits, isTooLongForScoring, isTooShortForScoring } from "../lib/scoring-limits.js";
import { shouldDisplayVideo } from "../lib/source-filter.js";
import { sourcePaths } from "../lib/paths.js";
import { getSource, listSources, promptPathForSource, type SourceConfig } from "../lib/sources.js";
import { SCORING_PROMPT_FILE } from "../lib/scoring-prompt.js";
import { extractSpeakers, parseScoreResponse } from "../lib/parse-score.js";
import { safeFilename } from "../lib/utils.js";
import type { IndexPayload, RankedVideo, RankingsPayload } from "../lib/types.js";

export function loadVideos(indexPath: string): IndexPayload["videos"] {
  const payload = JSON.parse(readFileSync(indexPath, "utf8")) as IndexPayload;
  return (payload.videos ?? []).filter((video) => video.transcript_status === "ok");
}

export function buildRankingsFromScoreFiles(
  indexPath: string,
  outputDir: string,
  source?: Pick<SourceConfig, "id" | "fetchKind" | "contentKind">,
): RankedVideo[] {
  const durationOpts = { applyLimits: source ? appliesDurationLimits(source) : true };
  const videos = loadVideos(indexPath);
  const results: RankedVideo[] = [];

  for (const video of videos) {
    if (isTooShortForScoring(video.duration_seconds, durationOpts)) {
      continue;
    }

    if (isTooLongForScoring(video.duration_seconds, durationOpts)) {
      results.push({
        id: video.id,
        title: video.title,
        url: video.url,
        duration_seconds: video.duration_seconds ?? null,
        upload_date: video.upload_date ?? null,
        status: "skipped",
        error: "exceeds scoring duration limit",
      });
      continue;
    }

    const scorePath = join(outputDir, `${safeFilename(video.title, video.id)}.txt`);
    if (!existsSync(scorePath)) {
      results.push({
        id: video.id,
        title: video.title,
        url: video.url,
        status: "failed",
        error: "missing score file",
      });
      continue;
    }

    const parsed = parseScoreResponse(readFileSync(scorePath, "utf8"));
    const { raw_response: _raw, ...fields } = parsed;
    results.push({
      id: video.id,
      title: video.title,
      speakers: video.channel ?? extractSpeakers(video.title, video.description),
      url: video.url,
      status: "ok",
      score_path: scorePath,
      word_count: resolveWordCount(video, source?.id),
      ...fields,
    });
  }

  return results;
}

export function finalizeRankings(
  results: RankedVideo[],
  options: {
    model?: string;
    promptPath?: string;
    indexPath: string;
    source: Pick<SourceConfig, "id" | "maxDisplayAgeDays" | "dateRange" | "fetchKind" | "contentKind">;
  },
): RankingsPayload {
  const indexPath = options.indexPath;
  const indexPayload = JSON.parse(readFileSync(indexPath, "utf8")) as IndexPayload;
  const indexById = indexVideosById(indexPayload);
  const durationOpts = { applyLimits: appliesDurationLimits(options.source) };

  const scorableResults: RankedVideo[] = [];
  const tooLongResults: RankedVideo[] = [];

  for (const result of results) {
    const metadata = indexById[result.id] ?? {};
    const durationSeconds = metadata.duration_seconds ?? result.duration_seconds ?? null;
    const uploadDate = metadata.upload_date ?? result.upload_date ?? null;

    if (!shouldDisplayVideo(uploadDate, options.source)) {
      continue;
    }

    if (isTooShortForScoring(durationSeconds, durationOpts)) {
      continue;
    }

    if (isTooLongForScoring(durationSeconds, durationOpts)) {
      tooLongResults.push({
        id: result.id,
        title: result.title,
        url: result.url,
        speakers: result.speakers ?? extractSpeakers(result.title, metadata.description),
        duration_seconds: durationSeconds,
        upload_date: metadata.upload_date ?? result.upload_date ?? null,
        status: "skipped",
        error: "exceeds scoring duration limit",
      });
      continue;
    }

    if (result.status !== "ok") {
      continue;
    }

    const dimensionComposite = computeCompositeFromDimensions(result);
    if (dimensionComposite != null) {
      result.composite = dimensionComposite;
    }

    if (result.composite != null) {
      scorableResults.push(result);
    }
  }

  const ranked = applyLikeRankAdjustment(scorableResults, indexById);

  ranked.forEach((result, index) => {
    const metadata = indexById[result.id] ?? {};
    result.duration_seconds = metadata.duration_seconds ?? result.duration_seconds ?? null;
    result.word_count =
      result.word_count ?? resolveWordCount(metadata, options.source.id) ?? null;
    result.rank = index + 1;
    result.tags = positiveDimensionTags(result);
  });

  const rankings = [...ranked, ...tooLongResults];

  return {
    source_id: options.source.id,
    model: options.model,
    prompt_path: SCORING_PROMPT_FILE,
    video_count: results.length,
    scored_count: ranked.length,
    ranked_count: ranked.length,
    rankings,
    failures: results.filter(
      (result) =>
        result.status !== "ok" && !isTooLongForScoring(result.duration_seconds, durationOpts),
    ),
  };
}

export function writeRankingsPayload(payload: RankingsPayload, outputPath: string): void {
  mkdirSync(join(outputPath, ".."), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function stripDevFields(video: RankedVideo): RankedVideo {
  const { score_path: _scorePath, central_claims: _centralClaims, ...rest } = video;
  return rest;
}

function prepareForPublish(video: RankedVideo): RankedVideo {
  const stripped = stripDevFields(video);
  return {
    ...stripped,
    tags: stripped.tags ?? positiveDimensionTags(stripped),
  };
}

export function sanitizePublishedPayload(
  payload: RankingsPayload,
  source: SourceConfig,
): RankingsPayload {
  const scored = payload.rankings.filter(isScoredRanking);
  const published = [...scored]
    .sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0))
    .map(prepareForPublish);

  published.forEach((video, index) => {
    video.rank = index + 1;
  });

  const durationOpts = { applyLimits: appliesDurationLimits(source) };
  const tooLong = payload.rankings
    .filter((video) => isTooLongForScoring(video.duration_seconds, durationOpts))
    .map(stripDevFields);

  const other: RankedVideo[] = [];

  const {
    prompt_path: _promptPath,
    failures: _failures,
    ...publicFields
  } = payload;

  return {
    ...publicFields,
    source_id: source.id,
    scored_count: scored.length,
    ranked_count: published.length,
    rankings: published,
    too_long: tooLong,
    other,
  };
}

export function publishRankings(options: {
  sourceId?: string;
  sourcePath?: string;
  outputPath?: string;
  reparse?: boolean;
  model?: string;
  promptPath?: string;
  indexPath?: string;
  scoresDir?: string;
} = {}): RankingsPayload | null {
  const source = getSource(options.sourceId);
  const paths = sourcePaths(source.id);
  const sourcePath = options.sourcePath ?? paths.rankingsPath;
  const outputPath = options.outputPath ?? paths.publicRankingsPath;
  const indexPath = options.indexPath ?? paths.indexPath;
  const scoresDir = options.scoresDir ?? paths.scoresDir;
  const promptPath = options.promptPath ?? promptPathForSource(source);

  if (!existsSync(indexPath)) {
    return null;
  }
  let payload: RankingsPayload;
  if (options.reparse || !existsSync(sourcePath)) {
    const results = buildRankingsFromScoreFiles(indexPath, scoresDir, source);
    const okCount = results.filter((result) => result.status === "ok").length;
    if (okCount === 0 && existsSync(outputPath) && !options.reparse) {
      const existing = JSON.parse(readFileSync(outputPath, "utf8")) as RankingsPayload;
      const published = sanitizePublishedPayload(existing, source);
      writeFileSync(outputPath, `${JSON.stringify(published, null, 2)}\n`, "utf8");
      return published;
    }
    payload = finalizeRankings(results, {
      model: options.model,
      promptPath: String(promptPath),
      indexPath,
      source,
    });
    writeRankingsPayload(payload, sourcePath);
  } else {
    const raw = JSON.parse(readFileSync(sourcePath, "utf8")) as RankingsPayload;
    payload = finalizeRankings(raw.rankings ?? [], {
      model: raw.model ?? options.model,
      promptPath: raw.prompt_path ?? String(promptPath),
      indexPath,
      source,
    });
  }

  mkdirSync(join(outputPath, ".."), { recursive: true });
  const published = sanitizePublishedPayload(payload, source);
  writeFileSync(outputPath, `${JSON.stringify(published, null, 2)}\n`, "utf8");
  return published;
}

export function publishAllRankings(options: {
  reparse?: boolean;
  model?: string;
} = {}): RankingsPayload[] {
  return listSources()
    .map((source) => publishRankings({ ...options, sourceId: source.id }))
    .filter((payload): payload is RankingsPayload => payload != null);
}
