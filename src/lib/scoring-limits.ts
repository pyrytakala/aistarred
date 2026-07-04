export const MIN_SCORED_DURATION_SECONDS = 5 * 60;
export const MAX_SCORED_DURATION_SECONDS = 3 * 60 * 60;

export function appliesDurationLimits(source: {
  fetchKind?: string;
  contentKind?: string;
}): boolean {
  return (source.fetchKind ?? "youtube") !== "essay" && source.contentKind !== "essay";
}

export function isTooShortForScoring(
  durationSeconds: number | null | undefined,
  options: { applyLimits?: boolean } = {},
): boolean {
  if (options.applyLimits === false) {
    return false;
  }
  return durationSeconds != null && durationSeconds <= MIN_SCORED_DURATION_SECONDS;
}

export function isTooLongForScoring(
  durationSeconds: number | null | undefined,
  options: { applyLimits?: boolean } = {},
): boolean {
  if (options.applyLimits === false) {
    return false;
  }
  return durationSeconds != null && durationSeconds > MAX_SCORED_DURATION_SECONDS;
}

export function isEligibleForScoring(
  durationSeconds: number | null | undefined,
  options: { applyLimits?: boolean } = {},
): boolean {
  if (options.applyLimits === false) {
    return true;
  }
  if (durationSeconds == null) {
    return true;
  }
  return !isTooShortForScoring(durationSeconds, options) && !isTooLongForScoring(durationSeconds, options);
}

export function formatScoringDurationLimit(): string {
  return "3 hours";
}

export function formatMinimumScoringDuration(): string {
  return "5 minutes";
}
