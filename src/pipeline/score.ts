import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";

import { AdaptiveConcurrency } from "../lib/adaptive-concurrency.js";
import { ApiCache, fetchCachedText, fireworksCacheKey } from "../lib/api-cache.js";
import {
  formatMinimumContentLength,
  countWords,
  isContentLongEnough,
} from "../lib/content-length.js";
import { pipelineLog, withPipelineTiming } from "../lib/pipeline-log.js";
import { StageTimer, stageLog } from "../lib/stage-log.js";
import { loadEnv } from "../lib/env.js";
import { sourcePaths } from "../lib/paths.js";
import { getSource, loadScoringPromptForSource, promptPathForSource, resolveSourceIdFromArgv } from "../lib/sources.js";
import { shouldDisplayVideo } from "../lib/source-filter.js";
import { extractSpeakers, parseScoreResponse } from "../lib/parse-score.js";
import { safeFilename, sleep } from "../lib/utils.js";
import { finalizeRankings, buildRankingsFromScoreFiles, loadVideos, writeRankingsPayload } from "./publish.js";
import {
  appliesDurationLimits,
  formatMinimumScoringDuration,
  formatScoringDurationLimit,
  isTooLongForScoring,
  isTooShortForScoring,
} from "../lib/scoring-limits.js";
import type { RankedVideo } from "../lib/types.js";
import type { SourceConfig } from "../lib/sources.js";

const FIREWORKS_URL = "https://api.fireworks.ai/inference/v1/chat/completions";
const DEFAULT_MODEL = "accounts/fireworks/models/deepseek-v4-flash";
const MAX_SCORE_RETRIES = 5;

function resolveTranscriptPath(
  transcriptPath: string | undefined,
  sourceId: string,
): string | null {
  if (!transcriptPath) {
    return null;
  }

  if (existsSync(transcriptPath)) {
    return transcriptPath;
  }

  const sourceTranscriptPath = join(sourcePaths(sourceId).transcriptsDir, basename(transcriptPath));
  if (existsSync(sourceTranscriptPath)) {
    return sourceTranscriptPath;
  }

  return transcriptPath;
}

class RateLimitError extends Error {
  constructor(
    message: string,
    readonly retryAfter: number | null = null,
  ) {
    super(message);
  }
}

function buildPrompt(template: string, title: string, speakers: string, transcript: string): string {
  return template
    .replaceAll("{title}", title)
    .replaceAll("{speakers}", speakers)
    .replaceAll("{transcript}", transcript);
}

async function fetchFireworksCompletion(
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens = 4096,
  temperature = 0.2,
): Promise<Response> {
  return withPipelineTiming("ai-score", "fireworks-request", { model, promptChars: prompt.length }, () =>
    fetch(FIREWORKS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature,
      }),
      signal: AbortSignal.timeout(300_000),
    }),
  );
}

async function scoreTranscript(
  apiKey: string,
  model: string,
  prompt: string,
  cache: ApiCache,
  useCache: boolean,
): Promise<[string, boolean]> {
  const cacheKey = fireworksCacheKey(model, prompt);
  return fetchCachedText(cache, {
    key: cacheKey,
    enabled: useCache,
    fetcher: async () => {
      const response = await fetchFireworksCompletion(apiKey, model, prompt);
      if ([408, 429, 503].includes(response.status)) {
        const retryAfter = response.headers.get("Retry-After");
        throw new RateLimitError(
          `Fireworks HTTP ${response.status}: ${await response.text()}`,
          retryAfter ? Number(retryAfter) : null,
        );
      }
      if (!response.ok) {
        throw new Error(`Fireworks HTTP ${response.status}: ${await response.text()}`);
      }
      const payload = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      return payload.choices[0].message.content;
    },
  });
}

async function scoreTranscriptWithRetries(
  apiKey: string,
  model: string,
  prompt: string,
  cache: ApiCache,
  concurrency: AdaptiveConcurrency,
  useCache: boolean,
): Promise<[string, boolean]> {
  for (let attempt = 0; attempt < MAX_SCORE_RETRIES; attempt += 1) {
    await concurrency.acquire();
    try {
      const [text, cacheHit] = await scoreTranscript(apiKey, model, prompt, cache, useCache);
      if (!cacheHit) {
        concurrency.reward();
      }
      return [text, cacheHit];
    } catch (error) {
      if (error instanceof RateLimitError) {
        concurrency.penalize(error.retryAfter);
        console.log(
          `  -> rate limited (attempt ${attempt + 1}/${MAX_SCORE_RETRIES}); reducing parallelism to ${concurrency.getCapacity()}`,
        );
      } else {
        throw error;
      }
    } finally {
      concurrency.release();
    }
  }
  throw new RateLimitError("Fireworks rate limit persisted after retries");
}

async function scoreVideoJob(options: {
  index: number;
  total: number;
  video: ReturnType<typeof loadVideos>[number];
  template: string;
  apiKey: string;
  model: string;
  outputDir: string;
  cache: ApiCache;
  concurrency: AdaptiveConcurrency;
  useCache: boolean;
  forceRescore: boolean;
  source: Pick<SourceConfig, "id" | "maxDisplayAgeDays" | "dateRange" | "fetchKind" | "contentKind" | "itemLabel">;
}): Promise<RankedVideo> {
  const { video, template, apiKey, model, outputDir, cache, concurrency, useCache, forceRescore, source } =
    options;
  const durationOpts = { applyLimits: appliesDurationLimits(source) };
  const title = video.title;
  const videoId = video.id;
  const transcriptPath = resolveTranscriptPath(video.transcript_path, options.source.id);
  const scorePath = join(outputDir, `${safeFilename(title, videoId)}.txt`);

  stageLog("score", `[${options.index}/${options.total}] ${title}`, { sourceId: source.id, videoId });

  if (isTooShortForScoring(video.duration_seconds, durationOpts)) {
    console.log(`  -> skipped: ${formatMinimumScoringDuration()} or shorter`);
    return {
      id: videoId,
      title,
      url: video.url,
      duration_seconds: video.duration_seconds ?? null,
      status: "skipped",
      error: "below minimum scoring duration",
    };
  }

  if (isTooLongForScoring(video.duration_seconds, durationOpts)) {
    console.log(`  -> skipped: longer than ${formatScoringDurationLimit()} scoring limit`);
    return {
      id: videoId,
      title,
      url: video.url,
      duration_seconds: video.duration_seconds ?? null,
      status: "skipped",
      error: "exceeds scoring duration limit",
    };
  }

  if (!shouldDisplayVideo(video.upload_date, options.source)) {
    const label = options.source.maxDisplayAgeDays != null
      ? `older than ${options.source.maxDisplayAgeDays} day display window`
      : "outside source date range";
    console.log(`  -> skipped: ${label}`);
    return {
      id: videoId,
      title,
      url: video.url,
      upload_date: video.upload_date ?? null,
      status: "skipped",
      error: "exceeds video age limit",
    };
  }

  if (!transcriptPath || !existsSync(transcriptPath)) {
    console.log(`  -> skipped: missing transcript at ${transcriptPath}`);
    return {
      id: videoId,
      title,
      url: video.url,
      status: "failed",
      error: `missing transcript at ${transcriptPath}`,
    };
  }

  const transcript = readFileSync(transcriptPath, "utf8");
  const wordCount = video.word_count ?? countWords(transcript);
  if (!isContentLongEnough(transcript)) {
    console.log(`  -> skipped: below ${formatMinimumContentLength()}`);
    return {
      id: videoId,
      title,
      url: video.url,
      status: "skipped",
      error: "below minimum content length",
    };
  }

  if (existsSync(scorePath) && !forceRescore) {
    const parsed = parseScoreResponse(readFileSync(scorePath, "utf8"));
    const { raw_response: _raw, ...fields } = parsed;
    const composite = fields.composite;
    console.log(`  -> reused existing score | ${composite ?? "?"}`);
    return {
      id: videoId,
      title,
      speakers: video.channel ?? extractSpeakers(title, video.description),
      url: video.url,
      status: "ok",
      score_path: scorePath,
      cache_hit: true,
      word_count: wordCount,
      ...fields,
    };
  }

  const speakers = video.channel ?? extractSpeakers(title, video.description);
  const prompt = buildPrompt(template, title, speakers, transcript);

  try {
    const [responseText, cacheHit] = await scoreTranscriptWithRetries(
      apiKey,
      model,
      prompt,
      cache,
      concurrency,
      useCache,
    );
    const parsed = parseScoreResponse(responseText);
    writeFileSync(scorePath, responseText, "utf8");
    const { raw_response: _raw, ...fields } = parsed;
    const composite = fields.composite;
    console.log(`  -> ${cacheHit ? "cache" : "api"} | ${composite ?? "?"}`);
    pipelineLog("ai-score", "score-video", {
      sourceId: options.source.id,
      videoId,
      cacheHit,
      composite: composite ?? null,
    });
    return {
      id: videoId,
      title,
      speakers,
      url: video.url,
      status: "ok",
      score_path: scorePath,
      cache_hit: cacheHit,
      word_count: wordCount,
      ...fields,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  -> failed: ${message}`);
    return {
      id: videoId,
      title,
      url: video.url,
      status: "failed",
      error: message,
    };
  }
}

export async function runScore(options: {
  sourceId?: string;
  indexPath?: string;
  promptPath?: string;
  outputDir?: string;
  model?: string;
  workers?: number;
  maxWorkers?: number;
  useCache?: boolean;
  forceRescore?: boolean;
  reparse?: boolean;
  videoIds?: Set<string>;
} = {}): Promise<number> {
  loadEnv();

  const source = getSource(options.sourceId);
  const paths = sourcePaths(source.id);
  const indexPath = options.indexPath ?? paths.indexPath;
  const promptPath = options.promptPath ?? promptPathForSource(source);
  const outputDir = options.outputDir ?? paths.scoresDir;
  const model = options.model ?? DEFAULT_MODEL;

  if (options.reparse) {
    const { publishRankings } = await import("./publish.js");
    publishRankings({ reparse: true, sourceId: source.id, model, promptPath: String(promptPath), indexPath });
    return 0;
  }

  const apiKey = (process.env.FIREWORKS_API_KEY ?? "").trim();
  if (!apiKey) {
    console.error("FIREWORKS_API_KEY is required in .env");
    return 1;
  }

  if (!existsSync(indexPath) || !existsSync(promptPath)) {
    console.error(`Missing index or prompt file`);
    return 1;
  }

  const template = loadScoringPromptForSource(source);
  const allVideos = loadVideos(indexPath);
  const videos = options.videoIds?.size
    ? allVideos.filter((video) => options.videoIds!.has(video.id))
    : allVideos;
  if (!videos.length) {
    console.error(options.videoIds?.size ? "No matching videos found in index." : "No scored transcripts found in index.");
    return 1;
  }

  const durationOpts = { applyLimits: appliesDurationLimits(source) };
  const scorableCount = videos.filter(
    (video) =>
      !isTooShortForScoring(video.duration_seconds, durationOpts) &&
      !isTooLongForScoring(video.duration_seconds, durationOpts) &&
      shouldDisplayVideo(video.upload_date, source),
  ).length;
  const skippedCount = videos.length - scorableCount;

  mkdirSync(outputDir, { recursive: true });
  const cache = new ApiCache("fireworks");
  const workers = options.workers ?? 4;
  const maxWorkers = options.maxWorkers ?? 8;
  const concurrency = new AdaptiveConcurrency(1, maxWorkers, workers);
  const useCache = options.useCache ?? true;

  const runTimer = new StageTimer("score", source.id);
  stageLog("score", `scoring ${scorableCount} ${source.itemLabel}`, {
    sourceId: source.id,
    model,
    workers,
    maxWorkers,
    skipped: skippedCount,
  });

  const results = await Promise.all(
    videos.map((video, index) =>
      scoreVideoJob({
        index: index + 1,
        total: videos.length,
        video,
        template,
        apiKey,
        model,
        outputDir,
        cache,
        concurrency,
        useCache,
        forceRescore: options.forceRescore ?? false,
        source,
      }),
    ),
  );

  const rankingResults = options.videoIds?.size
    ? buildRankingsFromScoreFiles(indexPath, outputDir, source)
    : results;

  const payload = finalizeRankings(rankingResults, {
    model,
    promptPath: String(promptPath),
    indexPath,
    source,
  });
  writeRankingsPayload(payload, join(outputDir, "rankings.json"));

  const okCount = results.filter((result) => result.status === "ok").length;
  const reusedCount = results.filter((result) => result.cache_hit).length;
  const failedCount = results.filter((result) => result.status === "failed").length;
  runTimer.done(source.id, {
    sourceId: source.id,
    ranked: payload.rankings.length,
    ok: okCount,
    reused: reusedCount,
    failed: failedCount,
    skipped: skippedCount,
  });

  console.log("\nRankings (best first):\n");
  for (const result of payload.rankings) {
    console.log(`${String(result.rank).padStart(2)}. ${result.composite?.toFixed(1)}/100  ${result.title}`);
  }
  console.log(`\nSaved detailed scores to ${outputDir}/`);
  return payload.rankings.length ? 0 : 1;
}

export async function runScoreCli(argv: string[]): Promise<number> {
  const reparse = argv.includes("--reparse");
  const forceRescore = argv.includes("--force-rescore");
  const noCache = argv.includes("--no-cache");
  const sourceId = resolveSourceIdFromArgv(argv);
  const videoIdsArg = argv.find((arg, index) => argv[index - 1] === "--video-ids");
  const videoIds = videoIdsArg
    ? new Set(videoIdsArg.split(",").map((id) => id.trim()).filter(Boolean))
    : undefined;
  const workersArg = argv.find((arg, index) => argv[index - 1] === "--workers");
  const maxWorkersArg = argv.find((arg, index) => argv[index - 1] === "--max-workers");
  const workers = workersArg ? Number(workersArg) : undefined;
  const maxWorkers = maxWorkersArg ? Number(maxWorkersArg) : undefined;
  return runScore({
    sourceId,
    reparse,
    forceRescore,
    useCache: !noCache,
    videoIds,
    workers: Number.isFinite(workers) ? workers : undefined,
    maxWorkers: Number.isFinite(maxWorkers) ? maxWorkers : undefined,
  });
}
