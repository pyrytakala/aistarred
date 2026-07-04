import type { RankedVideo, RankingsPayload } from "../types.js";
import { shouldDisplayVideo } from "./source-filter.js";
import { isScoredRanking } from "./score-bands.js";

export interface SourceDisplayFilter {
  maxDisplayAgeDays: number | null;
  dateRange?: { since: string; until: string };
}

export function visibleScoredFromPayload(
  payload: RankingsPayload,
  displayFilter: SourceDisplayFilter,
): RankedVideo[] {
  const inRange = (videos: RankedVideo[]) =>
    (videos || []).filter(
      (video) => shouldDisplayVideo(video.upload_date, displayFilter) && isScoredRanking(video),
    );

  const primary = inRange(payload.rankings || []);
  const seen = new Set(primary.map((video) => video.id));
  const merged = [...primary];

  for (const video of inRange(payload.other || [])) {
    if (!seen.has(video.id)) {
      merged.push(video);
      seen.add(video.id);
    }
  }

  return merged;
}

export function visibleScoredCount(
  payload: RankingsPayload,
  displayFilter: SourceDisplayFilter,
): number {
  return visibleScoredFromPayload(payload, displayFilter).length;
}
