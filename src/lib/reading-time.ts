/**
 * Approximate silent reading speed for English nonfiction (typical range 200–250 wpm).
 * Used to turn word counts into rounded reading-time labels.
 */
export const READING_WPM = 238;

/** Rounded minute buckets shown on cards. */
const READING_TIME_BUCKETS_MIN = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480, 600];

export function readingMinutesFromWords(words: number): number {
  if (!Number.isFinite(words) || words <= 0) {
    return 0;
  }
  return words / READING_WPM;
}

function nearestReadingBucket(rawMinutes: number): number {
  let best = READING_TIME_BUCKETS_MIN[0];
  let bestDistance = Math.abs(rawMinutes - best);

  for (const bucket of READING_TIME_BUCKETS_MIN) {
    const distance = Math.abs(rawMinutes - bucket);
    if (distance < bestDistance) {
      best = bucket;
      bestDistance = distance;
    }
  }

  return best;
}

export function formatReadingTimeLabel(words: number | null | undefined): string | null {
  if (words == null || words <= 0 || Number.isNaN(words)) {
    return null;
  }

  const rawMinutes = readingMinutesFromWords(words);
  if (rawMinutes < 3.5) {
    return "<5m read";
  }

  const bucket = nearestReadingBucket(rawMinutes);
  if (bucket < 60) {
    return `${bucket}m read`;
  }

  if (bucket % 60 === 0) {
    return `${bucket / 60}h read`;
  }

  const hours = Math.round(bucket / 60);
  return `${Math.max(1, hours)}h read`;
}
