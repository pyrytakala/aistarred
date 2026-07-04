import { existsSync, readFileSync } from "node:fs";

import { resolveTranscriptText } from "./content-length.js";
import type { IndexPayload, VideoIndexEntry } from "./types.js";

export function loadExistingIndexVideos(indexPath: string): Map<string, VideoIndexEntry> {
  if (!existsSync(indexPath)) {
    return new Map();
  }

  const payload = JSON.parse(readFileSync(indexPath, "utf8")) as IndexPayload;
  return new Map((payload.videos ?? []).map((video) => [video.id, video]));
}

export function hasUsableTranscript(entry: VideoIndexEntry, sourceId: string): boolean {
  if (entry.transcript_status !== "ok") {
    return false;
  }
  return resolveTranscriptText(entry, sourceId) != null;
}

export function shouldSkipItemFetch(
  entry: VideoIndexEntry | undefined,
  sourceId: string,
  options: { forceRefresh?: boolean },
): boolean {
  if (options.forceRefresh || !entry) {
    return false;
  }
  return hasUsableTranscript(entry, sourceId);
}

export function mergeIndexVideos(
  existing: Map<string, VideoIndexEntry>,
  updates: VideoIndexEntry[],
): VideoIndexEntry[] {
  const merged = new Map(existing);
  for (const entry of updates) {
    merged.set(entry.id, entry);
  }

  return [...merged.values()].sort((a, b) =>
    (b.upload_date ?? "").localeCompare(a.upload_date ?? ""),
  );
}
