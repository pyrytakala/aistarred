import type { Tag, RankedVideo } from "./types.js";

const POSITIVE_RULES: Array<[keyof RankedVideo, number, string]> = [
  ["substance", 8.0, "Substance"],
  ["evidence", 8.0, "Evidence"],
  ["specificity", 8.5, "Specificity"],
  ["insight_density", 8.0, "Insight"],
  ["non_promotion", 9.0, "Non-promo"],
];

export function positiveDimensionTags(video: RankedVideo): Tag[] {
  const tags: Tag[] = [];

  for (const [field, minimum, label] of POSITIVE_RULES) {
    const value = video[field];
    if (typeof value === "number" && value >= minimum) {
      tags.push({ label, tone: "positive" });
    }
  }

  return tags;
}

/** @deprecated Use positiveDimensionTags — kept for any stale imports. */
export function dimensionTags(video: RankedVideo): Tag[] {
  return positiveDimensionTags(video);
}
