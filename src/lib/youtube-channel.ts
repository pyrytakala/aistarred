import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { DateRange } from "./sources.js";
import { isWithinDateRange } from "./date-range.js";
import { isEligibleForScoring, MIN_SCORED_DURATION_SECONDS } from "./scoring-limits.js";
import { pipelineLogSync } from "./pipeline-log.js";

function resolveYtDlpCommand(): string[] | null {
  return resolveYtDlpCommandFrom();
}

export function resolveYtDlpCommandFrom(): string[] | null {
  const candidates: Array<string[]> = [
    [resolve(process.cwd(), ".venv", "bin", "python3"), "-m", "yt_dlp"],
    ["python3", "-m", "yt_dlp"],
    [resolve(process.cwd(), ".venv", "bin", "yt-dlp")],
    ["yt-dlp"],
  ];

  for (const command of candidates) {
    const executable = command[0];
    if (
      executable !== "python3" &&
      executable !== "yt-dlp" &&
      !existsSync(executable)
    ) {
      continue;
    }

    const result = spawnSync(command[0], [...command.slice(1), "--version"], {
      encoding: "utf8",
    });
    if (result.status === 0) {
      return command;
    }
  }

  return null;
}

export function listChannelVideosWithYtDlp(
  channelUrl: string,
  options: {
    dateRange?: DateRange;
    maxVideos?: number | null;
    sourceId?: string;
  } = {},
): Array<[string, Record<string, unknown>]> {
  return pipelineLogSync(
    "yt-fetch",
    "list-channel",
    {
      sourceId: options.sourceId ?? null,
      channelUrl,
      dateRange: options.dateRange ?? null,
    },
    () => listChannelVideosWithYtDlpInner(channelUrl, options),
  );
}

function fetchUploadDateWithYtDlp(ytDlp: string[], videoId: string): string | null {
  const result = spawnSync(
    ytDlp[0],
    [
      ...ytDlp.slice(1),
      "--no-warnings",
      "--print",
      "%(upload_date)s",
      `https://www.youtube.com/watch?v=${videoId}`,
    ],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    return null;
  }

  const uploadDate = result.stdout.trim();
  if (!uploadDate || uploadDate === "NA" || uploadDate.length !== 8) {
    return null;
  }

  return uploadDate;
}

function listFlatPlaylistEntries(
  ytDlp: string[],
  channelUrl: string,
): Array<{ videoId: string; title: string; durationSeconds: number | null }> {
  const result = spawnSync(
    ytDlp[0],
    [
      ...ytDlp.slice(1),
      "--ignore-errors",
      "--no-warnings",
      "--flat-playlist",
      "--print",
      "%(id)s\t%(title)s\t%(duration)s",
      channelUrl,
    ],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || "yt-dlp failed to list channel videos");
  }

  const entries: Array<{ videoId: string; title: string; durationSeconds: number | null }> = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const [videoId, title, durationText] = line.split("\t");
    if (!videoId) {
      continue;
    }

    const durationSeconds = Number(durationText);
    entries.push({
      videoId,
      title: title ?? videoId,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    });
  }

  return entries;
}

function listChannelVideosWithDateProbe(
  ytDlp: string[],
  channelUrl: string,
  options: {
    dateRange: DateRange;
    maxVideos?: number | null;
  },
): Array<[string, Record<string, unknown>]> {
  const flatEntries = listFlatPlaylistEntries(ytDlp, channelUrl);
  const videos: Array<[string, Record<string, unknown>]> = [];

  for (const entry of flatEntries) {
    if (!isEligibleForScoring(entry.durationSeconds)) {
      continue;
    }

    const uploadDate = fetchUploadDateWithYtDlp(ytDlp, entry.videoId);
    if (!uploadDate) {
      continue;
    }

    if (!isWithinDateRange(uploadDate, options.dateRange)) {
      if (uploadDate < options.dateRange.since) {
        break;
      }
      continue;
    }

    videos.push([
      entry.videoId,
      {
        videoId: entry.videoId,
        title: entry.title,
        published: uploadDateToIso(uploadDate),
        upload_date: uploadDate,
        lengthText: formatSecondsAsLengthText(entry.durationSeconds),
        duration_seconds: entry.durationSeconds,
      },
    ]);

    if (options.maxVideos != null && videos.length >= options.maxVideos) {
      break;
    }
  }

  return videos;
}

function listChannelVideosWithYtDlpInner(
  channelUrl: string,
  options: {
    dateRange?: DateRange;
    maxVideos?: number | null;
    sourceId?: string;
  } = {},
): Array<[string, Record<string, unknown>]> {
  const ytDlp = resolveYtDlpCommand();
  if (!ytDlp) {
    throw new Error("yt-dlp is required for calendar date-range channel listing");
  }

  if (options.dateRange) {
    return listChannelVideosWithDateProbe(ytDlp, channelUrl, {
      dateRange: options.dateRange,
      maxVideos: options.maxVideos,
    });
  }

  const args = [
    "--ignore-errors",
    "--no-warnings",
    "--flat-playlist",
    "--print",
    "%(id)s\t%(upload_date)s\t%(title)s\t%(duration)s",
    "--match-filter",
    `duration > ${MIN_SCORED_DURATION_SECONDS}`,
    channelUrl,
  ];

  const result = spawnSync(ytDlp[0], [...ytDlp.slice(1), ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || "yt-dlp failed to list channel videos");
  }

  const videos: Array<[string, Record<string, unknown>]> = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const [videoId, uploadDate, title, durationText] = line.split("\t");
    if (!videoId) {
      continue;
    }

    const durationSeconds = Number(durationText);
    if (!isEligibleForScoring(Number.isFinite(durationSeconds) ? durationSeconds : null)) {
      continue;
    }

    videos.push([
      videoId,
      {
        videoId,
        title,
        published: uploadDateToIso(uploadDate),
        upload_date: uploadDate !== "NA" ? uploadDate : null,
        lengthText: formatSecondsAsLengthText(
          Number.isFinite(durationSeconds) ? durationSeconds : null,
        ),
        duration_seconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
      },
    ]);

    if (options.maxVideos != null && videos.length >= options.maxVideos) {
      break;
    }
  }

  return videos;
}

function uploadDateToIso(uploadDate: string): string | null {
  if (!uploadDate || uploadDate.length !== 8) {
    return null;
  }

  const year = uploadDate.slice(0, 4);
  const month = uploadDate.slice(4, 6);
  const day = uploadDate.slice(6, 8);
  return `${year}-${month}-${day}T00:00:00.000Z`;
}

function formatSecondsAsLengthText(duration: number | null): string | null {
  if (duration == null || duration <= 0) {
    return null;
  }

  const total = Math.round(duration);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
