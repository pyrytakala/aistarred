export const MAX_SCORED_DURATION_SECONDS = 2 * 60 * 60;

export function isTooLongForScoring(durationSeconds: number | null | undefined): boolean {
  return durationSeconds != null && durationSeconds > MAX_SCORED_DURATION_SECONDS;
}

export function formatScoringDurationLimit(): string {
  return "2 hours";
}
