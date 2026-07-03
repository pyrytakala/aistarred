import type { IndexPayload, RankedVideo } from "./types.js";

export const DEFAULT_MAX_LIKE_ADJUSTMENT = 3.0;

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
  const scorable = results.filter((result) => result.composite != null);

  for (const result of scorable) {
    const metadata = indexById[result.id] ?? {};
    result.like_count = metadata.like_count ?? null;
    result.upload_date = metadata.upload_date ?? null;
    result.composite_base = result.composite;
    delete result.like_rank;
    delete result.like_adjustment;
  }

  assignLikeRanks(scorable);
  const rankedWithLikes = scorable.filter((result) => result.like_rank != null);
  const maxRank = rankedWithLikes.length
    ? Math.max(...rankedWithLikes.map((result) => result.like_rank ?? 0))
    : 0;

  for (const result of scorable) {
    const likeRank = result.like_rank;
    if (likeRank == null) {
      result.like_adjustment = 0;
      continue;
    }
    const adjustment = likeRankAdjustment(likeRank, maxRank, maxAdjustment);
    result.like_adjustment = adjustment;
    result.composite = Math.round(((result.composite_base ?? result.composite ?? 0) + adjustment) * 100) / 100;
  }

  return [...scorable].sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0));
}
