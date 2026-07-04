import type { RankedVideo } from "./types.js";

export function isScoredRanking(video: RankedVideo): boolean {
  return video.status === "ok" && video.composite != null;
}

export function displayScore(composite: number): number {
  return composite / 10;
}

export type ScoreBandId = "above-9" | "8-to-9" | "7-to-8" | "below-7";

export interface ScoreBand {
  id: ScoreBandId;
  label: string;
}

export const SCORE_BANDS: ScoreBand[] = [
  { id: "above-9", label: "Score >9.0" },
  { id: "8-to-9", label: "Score 8–9" },
  { id: "7-to-8", label: "Score 7–8" },
  { id: "below-7", label: "Score <7" },
];

export function scoreBandId(composite: number | null | undefined): ScoreBandId | null {
  if (composite == null || Number.isNaN(composite)) {
    return null;
  }

  const score = displayScore(composite);
  if (score > 9) {
    return "above-9";
  }
  if (score >= 8) {
    return "8-to-9";
  }
  if (score >= 7) {
    return "7-to-8";
  }
  return "below-7";
}

export function groupByScoreBand(
  videos: RankedVideo[],
): Array<{ band: ScoreBand; videos: RankedVideo[] }> {
  const grouped = new Map<ScoreBandId, RankedVideo[]>(
    SCORE_BANDS.map((band) => [band.id, []]),
  );

  for (const video of videos) {
    const bandId = scoreBandId(video.composite);
    if (!bandId) {
      continue;
    }
    grouped.get(bandId)?.push(video);
  }

  return SCORE_BANDS.map((band) => ({
    band,
    videos: grouped.get(band.id) ?? [],
  })).filter((section) => section.videos.length > 0);
}
