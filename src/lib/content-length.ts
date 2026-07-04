import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { sourcePaths } from "./paths.js";
import type { VideoIndexEntry } from "./types.js";

/** ~250 words/page × 3 pages */
export const MIN_CONTENT_WORDS = 750;

export function formatMinimumContentLength(): string {
  return `${MIN_CONTENT_WORDS} words (~3 pages)`;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function isContentLongEnough(text: string | null | undefined): boolean {
  if (!text?.trim()) {
    return false;
  }
  return countWords(text) >= MIN_CONTENT_WORDS;
}

export function resolveTranscriptText(
  entry: Pick<VideoIndexEntry, "transcript_path">,
  sourceId?: string,
): string | null {
  const transcriptPath = entry.transcript_path;
  if (!transcriptPath) {
    return null;
  }

  if (existsSync(transcriptPath)) {
    return readFileSync(transcriptPath, "utf8");
  }

  if (sourceId) {
    const localPath = join(sourcePaths(sourceId).transcriptsDir, basename(transcriptPath));
    if (existsSync(localPath)) {
      return readFileSync(localPath, "utf8");
    }
  }

  return null;
}

export function applyContentLengthGate(
  entry: VideoIndexEntry,
  sourceId?: string,
): VideoIndexEntry {
  if (entry.transcript_status !== "ok") {
    return entry;
  }

  const text = resolveTranscriptText(entry, sourceId);
  if (!text) {
    return entry;
  }

  if (isContentLongEnough(text)) {
    return entry;
  }

  return {
    ...entry,
    transcript_status: "too_short",
    error: `below minimum content length (${formatMinimumContentLength()})`,
  };
}
