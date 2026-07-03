import type { DateRange } from "./sources.js";
import { parseUploadDate } from "./video-age.js";

export function dateFromYyyymmdd(value: string): Date | null {
  return parseUploadDate(value);
}

export function isWithinDateRange(
  uploadDate: string | null | undefined,
  range: DateRange,
): boolean {
  const date = parseUploadDate(uploadDate);
  if (!date) {
    return false;
  }

  const since = dateFromYyyymmdd(range.since);
  const until = dateFromYyyymmdd(range.until);
  if (!since || !until) {
    return true;
  }

  const start = new Date(since.getFullYear(), since.getMonth(), since.getDate());
  const end = new Date(until.getFullYear(), until.getMonth(), until.getDate(), 23, 59, 59, 999);
  return date >= start && date <= end;
}

export function formatDateRange(range: DateRange): string {
  const since = dateFromYyyymmdd(range.since);
  const until = dateFromYyyymmdd(range.until);
  if (!since || !until) {
    return `${range.since}–${range.until}`;
  }

  const formatter = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return `${formatter.format(since)} – ${formatter.format(until)}`;
}
