import type { IndexPayload, RankedVideo } from "./types.js";
import { computeCompositeFromDimensions } from "./score-composite.js";

export const DEFAULT_MAX_LIKE_ADJUSTMENT = 3.0;

/** Length penalty kicks in only past this many minutes of runtime. */
export const LENGTH_PENALTY_THRESHOLD_MINUTES = 30;
/**
 * Penalty per 10 minutes of runtime beyond the threshold, expressed on the
 * displayed 0–10 score (0.1 = one tenth of a point). Internally the composite
 * is on a 0–100 scale, so the per-10-minute deduction is ×10.
 */
export const LENGTH_PENALTY_PER_10_MIN_DISPLAY = 0.1;

/**
 * Deduction applied to the composite (0–100 scale) for long runtimes: it drops
 * the score by {@link LENGTH_PENALTY_PER_10_MIN_DISPLAY} displayed points for
 * every 10 minutes beyond {@link LENGTH_PENALTY_THRESHOLD_MINUTES}. Content with
 * no known duration (e.g. essays) is never penalized. Returns a value ≤ 0.
 */
export function lengthAdjustment(durationSeconds: number | null | undefined): number {
  if (durationSeconds == null || Number.isNaN(durationSeconds)) {
    return 0;
  }
  const thresholdSeconds = LENGTH_PENALTY_THRESHOLD_MINUTES * 60;
  const overSeconds = durationSeconds - thresholdSeconds;
  if (overSeconds <= 0) {
    return 0;
  }
  const per10MinComposite = LENGTH_PENALTY_PER_10_MIN_DISPLAY * 10;
  const penalty = (overSeconds / 600) * per10MinComposite;
  return -Math.round(penalty * 100) / 100;
}

export function indexVideosById(indexPayload: IndexPayload): Record<string, IndexPayload["videos"][number]> {
  const map: Record<string, IndexPayload["videos"][number]> = {};
  for (const video of indexPayload.videos ?? []) {
    if (video.id) {
      map[video.id] = video;
    }
  }
  return map;
}

function assignLikeRanks(results: RankedVideo[]): void {
  const rankedByLikes = results
    .filter((result) => result.like_count != null)
    .sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0));

  let currentRank = 0;
  let previousLikes: number | null = null;
  for (const result of rankedByLikes) {
    if (result.like_count !== previousLikes) {
      currentRank += 1;
      previousLikes = result.like_count ?? null;
    }
    result.like_rank = currentRank;
  }
}

function likeRankAdjustment(likeRank: number, maxRank: number, maxAdjustment: number): number {
  if (maxRank <= 1) {
    return 0;
  }
  const normalized = (maxRank - likeRank) / (maxRank - 1);
  return Math.round((normalized - 0.5) * 2 * maxAdjustment * 100) / 100;
}

export function applyLikeRankAdjustment(
  results: RankedVideo[],
  indexById: Record<string, IndexPayload["videos"][number]>,
  maxAdjustment = DEFAULT_MAX_LIKE_ADJUSTMENT,
): RankedVideo[] {
  for (const result of results) {
    const computed = computeCompositeFromDimensions(result);
    if (computed != null) {
      result.composite = computed;
    }
  }

  const scorable = results.filter((result) => result.composite != null);

  for (const result of scorable) {
    const metadata = indexById[result.id] ?? {};
    result.like_count = metadata.like_count ?? null;
    result.upload_date = metadata.upload_date ?? null;
    result.duration_seconds = metadata.duration_seconds ?? null;
    result.word_count = metadata.word_count ?? result.word_count ?? null;
    const dimensionBase = computeCompositeFromDimensions(result);
    result.composite_base = dimensionBase ?? result.composite_base ?? result.composite ?? undefined;
    delete result.like_rank;
    delete result.like_adjustment;
    delete result.length_adjustment;
  }

  assignLikeRanks(scorable);
  const rankedWithLikes = scorable.filter((result) => result.like_rank != null);
  const maxRank = rankedWithLikes.length
    ? Math.max(...rankedWithLikes.map((result) => result.like_rank ?? 0))
    : 0;

  for (const result of scorable) {
    const likeRank = result.like_rank;
    const likeAdj = likeRank == null ? 0 : likeRankAdjustment(likeRank, maxRank, maxAdjustment);
    const lengthAdj = lengthAdjustment(result.duration_seconds);
    result.like_adjustment = likeAdj;
    result.length_adjustment = lengthAdj;
    const base = result.composite_base ?? result.composite ?? 0;
    result.composite = Math.round((base + likeAdj + lengthAdj) * 100) / 100;
  }

  return [...scorable].sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0));
}
