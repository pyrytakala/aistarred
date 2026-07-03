import type { Tag, RankedVideo } from "./types.js";

const POSITIVE_RULES: Array<[keyof RankedVideo, number, string]> = [
  ["substance", 8.5, "Very strong substance"],
  ["evidence", 8.5, "Strong evidence"],
  ["specificity", 9.0, "Very specific"],
  ["insight_density", 8.5, "High insight density"],
  ["non_promotion", 9.5, "Not promotional"],
];

const NEGATIVE_RULES: Array<[keyof RankedVideo, number, string]> = [
  ["substance", 5.5, "Weak substance"],
  ["evidence", 4.5, "Weak evidence"],
  ["specificity", 6.0, "Hand-wavy"],
  ["insight_density", 5.5, "Low insight density"],
  ["non_promotion", 4.5, "High promo"],
];

export function dimensionTags(video: RankedVideo): Tag[] {
  const tags: Tag[] = [];

  for (const [field, minimum, label] of POSITIVE_RULES) {
    const value = video[field];
    if (typeof value === "number" && value >= minimum) {
      tags.push({ label, tone: "positive" });
    }
  }

  for (const [field, maximum, label] of NEGATIVE_RULES) {
    const value = video[field];
    if (typeof value === "number" && value <= maximum) {
      tags.push({ label, tone: "negative" });
    }
  }

  return tags;
}
