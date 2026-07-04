import type { RankedVideo } from "../types.js";
import { parseUploadDate } from "./video-age.js";

export type SortMode = "date" | "score";

export function sortVideosByScore(videos: RankedVideo[]): RankedVideo[] {
  return [...videos].sort((a, b) => {
    const scoreDiff = (b.composite ?? 0) - (a.composite ?? 0);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    const dateA = parseUploadDate(a.upload_date)?.getTime() ?? 0;
    const dateB = parseUploadDate(b.upload_date)?.getTime() ?? 0;
    return dateB - dateA;
  });
}

export function sortVideosChronologically(videos: RankedVideo[]): RankedVideo[] {
  return [...videos].sort((a, b) => {
    const dateA = parseUploadDate(a.upload_date)?.getTime() ?? 0;
    const dateB = parseUploadDate(b.upload_date)?.getTime() ?? 0;
    if (dateB !== dateA) {
      return dateB - dateA;
    }
    return (b.composite ?? 0) - (a.composite ?? 0);
  });
}

export function sortVideos(videos: RankedVideo[], mode: SortMode): RankedVideo[] {
  if (mode === "score") {
    return sortVideosByScore(videos);
  }
  return sortVideosChronologically(videos);
}
