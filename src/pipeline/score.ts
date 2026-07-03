import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { AdaptiveConcurrency } from "../lib/adaptive-concurrency.js";
import { ApiCache, fetchCachedText, fireworksCacheKey } from "../lib/api-cache.js";
import { loadEnv } from "../lib/env.js";
import { PROMPT_PATH, SCORES_DIR, INDEX_PATH } from "../lib/paths.js";
import { extractSpeakers, parseScoreResponse } from "../lib/parse-score.js";
import { safeFilename, sleep } from "../lib/utils.js";
import { finalizeRankings, loadVideos, writeRankingsPayload } from "./publish.js";
import type { RankedVideo } from "../lib/types.js";

const FIREWORKS_URL = "https://api.fireworks.ai/inference/v1/chat/completions";
const DEFAULT_MODEL = "accounts/fireworks/models/deepseek-v4-flash";
const MAX_SCORE_RETRIES = 5;

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
  return fetch(FIREWORKS_URL, {
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
  });
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
}): Promise<RankedVideo> {
  const { video, template, apiKey, model, outputDir, cache, concurrency, useCache, forceRescore } =
    options;
  const title = video.title;
  const videoId = video.id;
  const transcriptPath = video.transcript_path;
  const scorePath = join(outputDir, `${safeFilename(title, videoId)}.txt`);

  console.log(`[${options.index}/${options.total}] ${title}`);

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

  if (existsSync(scorePath) && !forceRescore) {
    const parsed = parseScoreResponse(readFileSync(scorePath, "utf8"));
    const { raw_response: _raw, ...fields } = parsed;
    const composite = fields.composite;
    console.log(`  -> reused existing score | ${composite ?? "?"}`);
    return {
      id: videoId,
      title,
      speakers: extractSpeakers(title, video.description),
      url: video.url,
      status: "ok",
      score_path: scorePath,
      cache_hit: true,
      ...fields,
    };
  }

  const transcript = readFileSync(transcriptPath, "utf8");
  const speakers = extractSpeakers(title, video.description);
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
    return {
      id: videoId,
      title,
      speakers,
      url: video.url,
      status: "ok",
      score_path: scorePath,
      cache_hit: cacheHit,
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
  indexPath?: string;
  promptPath?: string;
  outputDir?: string;
  model?: string;
  workers?: number;
  maxWorkers?: number;
  useCache?: boolean;
  forceRescore?: boolean;
  reparse?: boolean;
} = {}): Promise<number> {
  loadEnv();

  const indexPath = options.indexPath ?? INDEX_PATH;
  const promptPath = options.promptPath ?? PROMPT_PATH;
  const outputDir = options.outputDir ?? SCORES_DIR;
  const model = options.model ?? DEFAULT_MODEL;

  if (options.reparse) {
    const { publishRankings } = await import("./publish.js");
    publishRankings({ reparse: true, model, promptPath: String(promptPath), indexPath });
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

  const template = readFileSync(promptPath, "utf8");
  const videos = loadVideos(indexPath);
  if (!videos.length) {
    console.error("No scored transcripts found in index.");
    return 1;
  }

  mkdirSync(outputDir, { recursive: true });
  const cache = new ApiCache("fireworks");
  const workers = options.workers ?? 4;
  const maxWorkers = options.maxWorkers ?? 8;
  const concurrency = new AdaptiveConcurrency(1, maxWorkers, workers);
  const useCache = options.useCache ?? true;

  console.log(
    `Scoring ${videos.length} talks with ${model} using up to ${workers} workers (adaptive 1-${maxWorkers})...\n`,
  );

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
      }),
    ),
  );

  const payload = finalizeRankings(results, {
    model,
    promptPath: String(promptPath),
    indexPath,
  });
  writeRankingsPayload(payload, join(outputDir, "rankings.json"));

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
  return runScore({ reparse, forceRescore, useCache: !noCache });
}
