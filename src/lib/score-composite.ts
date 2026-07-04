import type { RankedVideo } from "./types.js";

export const SCORE_DIMENSIONS = [
  { key: "substance", label: "Substance", weight: 2.5 },
  { key: "evidence", label: "Evidence", weight: 1.5 },
  { key: "specificity", label: "Specificity", weight: 1 },
  { key: "insight_density", label: "Insight", weight: 2 },
  { key: "non_promotion", label: "Non-promo", weight: 0.5 },
  { key: "practical_utility", label: "Utility", weight: 2.5 },
] as const;

export type ScoreDimensionKey = (typeof SCORE_DIMENSIONS)[number]["key"];

export const SCORE_WEIGHT_TOTAL = SCORE_DIMENSIONS.reduce((sum, dimension) => sum + dimension.weight, 0);

type DimensionScores = Partial<Record<ScoreDimensionKey, number | null | undefined>>;

/** Scale present dimension scores to 0–100 using their relative weights. */
export function computeCompositeFromDimensions(video: DimensionScores): number | null {
  let weightedSum = 0;
  let weightTotal = 0;

  for (const dimension of SCORE_DIMENSIONS) {
    const value = video[dimension.key];
    if (value == null || Number.isNaN(value)) {
      continue;
    }
    weightedSum += Number(value) * dimension.weight;
    weightTotal += dimension.weight;
  }

  if (weightTotal === 0) {
    return null;
  }

  return Math.round((weightedSum / weightTotal) * 10 * 100) / 100;
}

export function applyDimensionComposite(video: RankedVideo): RankedVideo {
  const computed = computeCompositeFromDimensions(video);
  if (computed == null) {
    return video;
  }
  return { ...video, composite: computed };
}
