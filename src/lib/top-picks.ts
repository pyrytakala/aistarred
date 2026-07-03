import type { RankedVideo } from "./types.js";

export const TOP_PICK_FRACTION = 1 / 3;

export function topPickCount(scoredCount: number): number {
  if (scoredCount <= 0) {
    return 0;
  }
  return Math.max(1, Math.ceil(scoredCount * TOP_PICK_FRACTION));
}

export function isScoredRanking(video: RankedVideo): boolean {
  return video.status === "ok" && video.composite != null;
}

/** Keep only the top third of scored videos (already sorted by composite). */
export function selectTopPicks(videos: RankedVideo[]): RankedVideo[] {
  const scored = videos.filter(isScoredRanking);
  return scored.slice(0, topPickCount(scored.length));
}
