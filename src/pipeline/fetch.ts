import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { loadEnv } from "../lib/env.js";
import { TRANSCRIPTS_DIR } from "../lib/paths.js";
import {
  fetchYoutubeUploadDate,
  plainTextFromString,
  sleep,
  titleToFilename,
} from "../lib/utils.js";
import { defaultProviderName, getProvider } from "../providers/index.js";
import { TranscriptProviderError, type TranscriptProvider } from "../providers/types.js";
import type { IndexPayload, VideoIndexEntry } from "../lib/types.js";

const DEFAULT_CHANNEL_URL = "https://www.youtube.com/@aiDotEngineer/videos";

function saveTranscript(
  outputDir: string,
  title: string,
  videoId: string,
  transcriptText: string,
  usedNames: Set<string>,
): string {
  let filename = titleToFilename(title);
  if (usedNames.has(filename)) {
    filename = `${filename.replace(/\.txt$/, "")} [${videoId}].txt`;
  }
  usedNames.add(filename);
  const textPath = join(outputDir, filename);
  writeFileSync(textPath, transcriptText, "utf8");
  return textPath;
}

function findExistingTranscript(outputDir: string, title: string, videoId: string): string | null {
  const candidates = [
    join(outputDir, titleToFilename(title)),
    join(outputDir, `${titleToFilename(title).replace(/\.txt$/, "")} [${videoId}].txt`),
  ];

  for (const path of readdirSync(outputDir)) {
    if (path.endsWith(".txt") && path.includes(`[${videoId}]`)) {
      candidates.push(join(outputDir, path));
    }
  }

  for (const path of candidates) {
    if (existsSync(path) && readFileSync(path, "utf8").length > 0) {
      return path;
    }
  }
  return null;
}

async function processVideo(
  provider: TranscriptProvider,
  videoId: string,
  outputDir: string,
  usedNames: Set<string>,
  requestDelay: number,
  metadataPayload?: Record<string, unknown>,
): Promise<VideoIndexEntry> {
  const metadata = metadataPayload ?? (await provider.getMetadata(videoId));
  const fields = provider.metadataToIndexFields(metadata);
  if (!fields.upload_date) {
    try {
      fields.upload_date = await fetchYoutubeUploadDate(videoId);
    } catch {
      // ignore
    }
  }

  const title = String(fields.title ?? videoId);
  const result: VideoIndexEntry = {
    id: videoId,
    title,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    view_count: (fields.view_count as number | null) ?? null,
    like_count: (fields.like_count as number | null) ?? null,
    comment_count: (fields.comment_count as number | null) ?? null,
    upload_date: (fields.upload_date as string | null) ?? null,
    duration_seconds: (fields.duration_seconds as number | null) ?? null,
    channel: (fields.channel as string | null) ?? null,
    description: (fields.description as string | null) ?? null,
  };

  try {
    const existingPath = findExistingTranscript(outputDir, title, videoId);
    let transcriptText: string;
    let transcriptMeta: Record<string, unknown>;
    let textPath: string;

    if (existingPath) {
      transcriptText = readFileSync(existingPath, "utf8");
      transcriptMeta = { language_code: null, available_langs: [] };
      textPath = existingPath;
    } else {
      [transcriptText, transcriptMeta] = await provider.getTranscript(videoId);
      textPath = saveTranscript(outputDir, title, videoId, transcriptText, usedNames);
    }

    Object.assign(result, {
      transcript_status: "ok",
      transcript_provider: provider.name,
      transcript_path: textPath,
      line_count: transcriptText.split(/\r?\n/).length,
      language_code: transcriptMeta.language_code ?? null,
      available_langs: transcriptMeta.available_langs ?? [],
    });
  } catch (error) {
    result.transcript_status = "failed";
    result.error = error instanceof Error ? error.message : String(error);
  }

  if (requestDelay > 0) {
    await sleep(requestDelay);
  }

  return result;
}

async function backfillUploadDates(outputDir: string, requestDelay: number): Promise<number> {
  const indexPath = join(outputDir, "index.json");
  if (!existsSync(indexPath)) {
    console.error(`Missing index file: ${indexPath}`);
    return 1;
  }

  const payload = JSON.parse(readFileSync(indexPath, "utf8")) as IndexPayload;
  const pending = (payload.videos ?? []).filter((video) => !video.upload_date);
  if (!pending.length) {
    console.log("All videos already have upload dates.");
    return 0;
  }

  console.log(`Backfilling upload dates for ${pending.length} videos...\n`);
  let updated = 0;

  for (const [index, video] of pending.entries()) {
    console.log(`[${index + 1}/${pending.length}] ${video.title} (${video.id})`);
    try {
      const uploadDate = await fetchYoutubeUploadDate(
        video.id,
        index > 0 ? requestDelay : 0,
      );
      if (!uploadDate) {
        console.log("  -> failed: upload date not found");
        continue;
      }
      video.upload_date = uploadDate;
      updated += 1;
      console.log(`  -> ${uploadDate}`);
    } catch (error) {
      console.log(`  -> failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  writeFileSync(indexPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`\nDone. Updated ${updated}/${pending.length} videos in ${indexPath}`);
  return updated ? 0 : 1;
}

export async function runFetch(argv: string[]): Promise<number> {
  loadEnv();

  const outputDir = TRANSCRIPTS_DIR;
  mkdirSync(outputDir, { recursive: true });

  if (argv.includes("--backfill-upload-dates")) {
    const delay = Number(argv.find((arg, index) => argv[index - 1] === "--request-delay") ?? 1);
    return backfillUploadDates(outputDir, delay);
  }

  const noCache = argv.includes("--no-cache");
  const providerName = argv.find((arg, index) => argv[index - 1] === "--provider");
  let provider;
  try {
    provider = getProvider(providerName, !noCache);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }

  if (argv.includes("--retry-transcripts") || argv.includes("--refresh-transcripts")) {
    const indexPath = join(outputDir, "index.json");
    if (!existsSync(indexPath)) {
      console.error(`Missing index file: ${indexPath}`);
      return 1;
    }
    const payload = JSON.parse(readFileSync(indexPath, "utf8")) as IndexPayload;
    const refreshAll = argv.includes("--refresh-transcripts");
    const pending = refreshAll
      ? payload.videos
      : (payload.videos ?? []).filter((video) => video.transcript_status !== "ok");

    if (!pending.length) {
      console.log("All transcripts already downloaded.");
      return 0;
    }

    const requestDelay = Number(
      argv.find((arg, index) => argv[index - 1] === "--request-delay") ?? 1,
    );
    console.log(
      `${refreshAll ? "Refreshing" : "Retrying"} ${pending.length} transcripts via ${provider.name}...\n`,
    );

    for (const [index, video] of pending.entries()) {
      console.log(`[${index + 1}/${pending.length}] ${video.title} (${video.id})`);
      try {
        const [transcriptText, transcriptMeta] = await provider.getTranscript(video.id);
        const textPath = join(outputDir, titleToFilename(video.title));
        writeFileSync(textPath, transcriptText, "utf8");
        video.transcript_status = "ok";
        video.transcript_provider = provider.name;
        video.transcript_path = textPath;
        video.line_count = transcriptText.split(/\r?\n/).length;
        video.language_code = (transcriptMeta.language_code as string | null) ?? null;
        video.available_langs = (transcriptMeta.available_langs as string[]) ?? [];
        delete video.error;
        console.log("  -> ok");
      } catch (error) {
        video.transcript_status = "failed";
        video.error = error instanceof Error ? error.message : String(error);
        console.log(`  -> failed: ${video.error}`);
      }
      if (requestDelay > 0 && index < pending.length - 1) {
        await sleep(requestDelay);
      }
    }

    payload.provider = provider.name;
    writeFileSync(indexPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    const okCount = (payload.videos ?? []).filter((video) => video.transcript_status === "ok").length;
    console.log(`\nDone. ${okCount}/${payload.videos?.length ?? 0} transcripts available in ${outputDir}/`);
    return okCount ? 0 : 1;
  }

  const channelUrl =
    argv.find((arg, index) => argv[index - 1] === "--channel-url") ?? DEFAULT_CHANNEL_URL;
  const months = Number(argv.find((arg, index) => argv[index - 1] === "--months") ?? 2);
  const probeLimit = Number(argv.find((arg, index) => argv[index - 1] === "--probe-limit") ?? 500);
  const limitArg = argv.find((arg, index) => argv[index - 1] === "--limit");
  const maxVideos = limitArg ? Number(limitArg) : null;
  const requestDelay = Number(
    argv.find((arg, index) => argv[index - 1] === "--request-delay") ?? 1,
  );

  console.log(
    `Listing videos from ${channelUrl} published within the past ${months} month(s) via ${provider.name}...`,
  );

  let videoIds: Array<[string, Record<string, unknown>]>;
  try {
    videoIds = await provider.listChannelVideosSince(channelUrl, {
      months,
      probeLimit,
      maxVideos,
      requestDelay,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }

  if (!videoIds.length) {
    console.error("No videos found in the requested date window.");
    return 1;
  }

  console.log(`Found ${videoIds.length} videos in window. Fetching transcripts...\n`);

  const results: VideoIndexEntry[] = [];
  const usedNames = new Set<string>();

  for (const [index, [videoId, metadataPayload]] of videoIds.entries()) {
    console.log(`[${index + 1}/${videoIds.length}] ${videoId}`);
    const result = await processVideo(
      provider,
      videoId,
      outputDir,
      usedNames,
      requestDelay > 0 && index < videoIds.length - 1 ? requestDelay : 0,
      metadataPayload,
    );
    results.push(result);
    console.log(
      `  -> ${result.title}\n     transcript: ${result.transcript_status}, views: ${result.view_count}, upload_date: ${result.upload_date}`,
    );
  }

  const indexPath = join(outputDir, "index.json");
  writeFileSync(
    indexPath,
    `${JSON.stringify(
      {
        provider: provider.name,
        channel_url: channelUrl,
        months,
        video_count: results.length,
        videos: results,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const okCount = results.filter((result) => result.transcript_status === "ok").length;
  console.log(`\nDone. Saved ${okCount}/${results.length} transcripts to ${outputDir}/`);
  console.log(`Metadata: ${indexPath}`);
  return okCount ? 0 : 1;
}

export function defaultChannelUrl(): string {
  return DEFAULT_CHANNEL_URL;
}

export function resolvedDefaultProviderName(): string {
  loadEnv();
  return defaultProviderName();
}
