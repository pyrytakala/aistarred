import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { dimensionTags } from "../lib/dimension-tags.js";
import { applyLikeRankAdjustment, indexVideosById } from "../lib/ranking-adjustments.js";
import {
  INDEX_PATH,
  PROMPT_PATH,
  PUBLIC_RANKINGS_PATH,
  RANKINGS_PATH,
  SCORES_DIR,
} from "../lib/paths.js";
import { extractSpeakers, parseScoreResponse } from "../lib/parse-score.js";
import { safeFilename } from "../lib/utils.js";
import type { IndexPayload, RankedVideo, RankingsPayload } from "../lib/types.js";

export function loadVideos(indexPath = INDEX_PATH): IndexPayload["videos"] {
  const payload = JSON.parse(readFileSync(indexPath, "utf8")) as IndexPayload;
  return (payload.videos ?? []).filter((video) => video.transcript_status === "ok");
}

export function buildRankingsFromScoreFiles(
  indexPath = INDEX_PATH,
  outputDir = SCORES_DIR,
): RankedVideo[] {
  const videos = loadVideos(indexPath);
  const results: RankedVideo[] = [];

  for (const video of videos) {
    const scorePath = join(outputDir, `${safeFilename(video.title, video.id)}.txt`);
    if (!existsSync(scorePath)) {
      results.push({
        id: video.id,
        title: video.title,
        url: video.url,
        status: "failed",
        error: `missing score file: ${scorePath}`,
      });
      continue;
    }

    const parsed = parseScoreResponse(readFileSync(scorePath, "utf8"));
    const { raw_response: _raw, ...fields } = parsed;
    results.push({
      id: video.id,
      title: video.title,
      speakers: extractSpeakers(video.title, video.description),
      url: video.url,
      status: "ok",
      score_path: scorePath,
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
    indexPath?: string;
  } = {},
): RankingsPayload {
  const indexPath = options.indexPath ?? INDEX_PATH;
  const indexPayload = JSON.parse(readFileSync(indexPath, "utf8")) as IndexPayload;
  const indexById = indexVideosById(indexPayload);
  const ranked = applyLikeRankAdjustment(results, indexById);

  ranked.forEach((result, index) => {
    result.rank = index + 1;
    result.tags = dimensionTags(result);
  });

  return {
    model: options.model,
    prompt_path: options.promptPath,
    video_count: results.length,
    ranked_count: ranked.length,
    rankings: ranked,
    failures: results.filter((result) => result.status !== "ok"),
  };
}

export function writeRankingsPayload(payload: RankingsPayload, outputPath = RANKINGS_PATH): void {
  mkdirSync(join(outputPath, ".."), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function publishRankings(options: {
  sourcePath?: string;
  outputPath?: string;
  reparse?: boolean;
  model?: string;
  promptPath?: string;
  indexPath?: string;
} = {}): RankingsPayload {
  const sourcePath = options.sourcePath ?? RANKINGS_PATH;
  const outputPath = options.outputPath ?? PUBLIC_RANKINGS_PATH;
  const indexPath = options.indexPath ?? INDEX_PATH;
  const promptPath = options.promptPath ?? PROMPT_PATH;

  let payload: RankingsPayload;
  if (options.reparse || !existsSync(sourcePath)) {
    const results = buildRankingsFromScoreFiles(indexPath, SCORES_DIR);
    const okCount = results.filter((result) => result.status === "ok").length;
    if (okCount === 0 && existsSync(outputPath)) {
      return JSON.parse(readFileSync(outputPath, "utf8")) as RankingsPayload;
    }
    payload = finalizeRankings(results, {
      model: options.model,
      promptPath: String(promptPath),
      indexPath,
    });
    writeRankingsPayload(payload, sourcePath);
  } else {
    const raw = JSON.parse(readFileSync(sourcePath, "utf8")) as RankingsPayload;
    payload = finalizeRankings(raw.rankings ?? [], {
      model: raw.model ?? options.model,
      promptPath: raw.prompt_path ?? String(promptPath),
      indexPath,
    });
  }

  mkdirSync(join(outputPath, ".."), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}
