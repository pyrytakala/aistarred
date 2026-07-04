import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { isWithinDateRange } from "../lib/date-range.js";
import { halfYearDateRange, shouldExpandToHalfYear } from "../lib/half-year.js";
import { pipelineLog, withPipelineTiming } from "../lib/pipeline-log.js";
import { isEligibleForScoring } from "../lib/scoring-limits.js";
import { loadEnv } from "../lib/env.js";
import { sourcePaths } from "../lib/paths.js";
import {
  getSource,
  resolveSourceIdFromArgv,
  type SourceConfig,
} from "../lib/sources.js";
import { listChannelVideosWithYtDlp } from "../lib/youtube-channel.js";
import { fetchTranscriptWithYtDlp } from "../lib/youtube-transcript.js";
import {
  fetchYoutubeUploadDate,
  plainTextFromString,
  sleep,
  titleToFilename,
} from "../lib/utils.js";
import { defaultProviderName, getProvider } from "../providers/index.js";
import { TranscriptProviderError, type TranscriptProvider } from "../providers/types.js";
import type { IndexPayload, VideoIndexEntry } from "../lib/types.js";

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
      try {
        [transcriptText, transcriptMeta] = await provider.getTranscript(videoId);
      } catch (providerError) {
        const fallbackText = fetchTranscriptWithYtDlp(videoId);
        if (!fallbackText) {
          throw providerError;
        }
        transcriptText = fallbackText;
        transcriptMeta = { language_code: "en", available_langs: ["en"], provider: "yt-dlp" };
      }
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

function listOptionsForSource(source: SourceConfig) {
  const probeLimit = 500;
  if (source.dateRange) {
    return {
      ...source.fetchWindow,
      since: source.dateRange.since,
      until: source.dateRange.until,
      probeLimit,
    };
  }

  return {
    ...source.fetchWindow,
    probeLimit,
  };
}

function filterVideosBySource(
  videoIds: Array<[string, Record<string, unknown>]>,
  provider: TranscriptProvider,
  source: SourceConfig,
): Array<[string, Record<string, unknown>]> {
  return videoIds.filter(([_videoId, metadata]) => {
    const fields = provider.metadataToIndexFields(metadata);
    const uploadDate = (fields.upload_date as string | null) ?? null;
    const durationSeconds = (fields.duration_seconds as number | null) ?? null;
    if (source.dateRange && !isWithinDateRange(uploadDate, source.dateRange)) {
      return false;
    }
    return isEligibleForScoring(durationSeconds);
  });
}

export async function runFetch(argv: string[]): Promise<number> {
  loadEnv();

  const source = getSource(resolveSourceIdFromArgv(argv));
  const paths = sourcePaths(source.id);
  const outputDir = paths.transcriptsDir;
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
    const indexPath = paths.indexPath;
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
      `${refreshAll ? "Refreshing" : "Retrying"} ${pending.length} transcripts for ${source.title} via ${provider.name}...\n`,
    );

    for (const [index, video] of pending.entries()) {
      console.log(`[${index + 1}/${pending.length}] ${video.title} (${video.id})`);
      try {
        let transcriptText: string;
        let transcriptMeta: Record<string, unknown>;
        try {
          [transcriptText, transcriptMeta] = await provider.getTranscript(video.id);
        } catch (providerError) {
          const fallbackText = fetchTranscriptWithYtDlp(video.id);
          if (!fallbackText) {
            throw providerError;
          }
          transcriptText = fallbackText;
          transcriptMeta = { language_code: "en", available_langs: ["en"], provider: "yt-dlp" };
          console.log("  -> ok (yt-dlp subtitles)");
        }
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
    argv.find((arg, index) => argv[index - 1] === "--channel-url") ?? source.channelUrl;
  const listWindow = listOptionsForSource(source);
  const probeLimit = Number(argv.find((arg, index) => argv[index - 1] === "--probe-limit") ?? listWindow.probeLimit);
  const limitArg = argv.find((arg, index) => argv[index - 1] === "--limit");
  const maxVideos = limitArg ? Number(limitArg) : null;
  const requestDelay = Number(
    argv.find((arg, index) => argv[index - 1] === "--request-delay") ?? 1,
  );

  const windowLabel = source.dateRange
    ? `${source.dateRange.since}–${source.dateRange.until}`
    : "days" in listWindow && listWindow.days != null
      ? `${listWindow.days} day(s)`
      : `${listWindow.months ?? 2} month(s)`;
  console.log(
    `Listing videos from ${channelUrl} for ${source.title} (${windowLabel}) via ${provider.name}...`,
  );

  let effectiveDateRange = source.dateRange;
  let videoIds: Array<[string, Record<string, unknown>]>;
  try {
    if (source.dateRange) {
      videoIds = listChannelVideosWithYtDlp(channelUrl, {
        dateRange: source.dateRange,
        maxVideos,
        sourceId: source.id,
      });
      videoIds = filterVideosBySource(videoIds, provider, source);

      if (shouldExpandToHalfYear(videoIds.length, source.dateRange)) {
        const h1Range = halfYearDateRange(Number(source.dateRange.since.slice(0, 4)));
        console.log(
          `Only ${videoIds.length} videos in Q2 — expanding to H1 (${h1Range.since}–${h1Range.until}).`,
        );
        pipelineLog("yt-fetch", "expand-to-half-year", {
          sourceId: source.id,
          q2Count: videoIds.length,
          dateRange: h1Range,
        });
        effectiveDateRange = h1Range;
        videoIds = listChannelVideosWithYtDlp(channelUrl, {
          dateRange: h1Range,
          maxVideos,
          sourceId: source.id,
        });
        videoIds = filterVideosBySource(videoIds, provider, {
          ...source,
          dateRange: h1Range,
        });
      }
    } else {
      videoIds = await provider.listChannelVideosSince(channelUrl, {
        ...listWindow,
        probeLimit,
        maxVideos,
        requestDelay,
      });
      videoIds = filterVideosBySource(videoIds, provider, source);
    }
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
    const result = await withPipelineTiming(
      "yt-fetch",
      "transcript",
      { sourceId: source.id, videoId, index: index + 1, total: videoIds.length },
      () =>
        processVideo(
          provider,
          videoId,
          outputDir,
          usedNames,
          requestDelay > 0 && index < videoIds.length - 1 ? requestDelay : 0,
          metadataPayload,
        ),
    );
    results.push(result);
    console.log(
      `  -> ${result.title}\n     transcript: ${result.transcript_status}, views: ${result.view_count}, upload_date: ${result.upload_date}`,
    );
  }

  const indexPath = paths.indexPath;
  writeFileSync(
    indexPath,
    `${JSON.stringify(
      {
        source_id: source.id,
        provider: provider.name,
        channel_url: channelUrl,
        date_range: effectiveDateRange ?? source.dateRange ?? null,
        ...listWindow,
        video_count: results.length,
        videos: results,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  pipelineLog("yt-fetch", "fetch-complete", {
    sourceId: source.id,
    videoCount: results.length,
    okCount: results.filter((result) => result.transcript_status === "ok").length,
    dateRange: effectiveDateRange ?? source.dateRange ?? null,
  });

  const okCount = results.filter((result) => result.transcript_status === "ok").length;
  console.log(`\nDone. Saved ${okCount}/${results.length} transcripts to ${outputDir}/`);
  console.log(`Metadata: ${indexPath}`);
  return okCount ? 0 : 1;
}

export function defaultChannelUrl(sourceId?: string): string {
  return getSource(sourceId).channelUrl;
}

export function resolvedDefaultProviderName(): string {
  loadEnv();
  return defaultProviderName();
}
