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

  const args = [
    "--ignore-errors",
    "--no-warnings",
    "--print",
    "%(id)s\t%(upload_date)s\t%(title)s\t%(duration)s",
    channelUrl,
  ];

  if (options.dateRange) {
    args.splice(
      args.length - 1,
      0,
      "--match-filter",
      `upload_date >= ${options.dateRange.since} & upload_date <= ${options.dateRange.until} & duration > ${MIN_SCORED_DURATION_SECONDS}`,
    );
  } else {
    args.splice(
      args.length - 1,
      0,
      "--match-filter",
      `duration > ${MIN_SCORED_DURATION_SECONDS}`,
    );
  }

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

    if (options.dateRange && uploadDate && !isWithinDateRange(uploadDate, options.dateRange)) {
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
        upload_date: uploadDate,
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
