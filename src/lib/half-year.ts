import type { DateRange } from "./sources-config.js";

export const MIN_VIDEOS_FOR_QUARTER = 10;

export function halfYearDateRange(year: number): DateRange {
  return { since: `${year}0101`, until: `${year}0630` };
}

export function isQ2DateRange(range: DateRange, year = 2026): boolean {
  return range.since === `${year}0401` && range.until === `${year}0630`;
}

export function shouldExpandToHalfYear(
  videoCount: number,
  dateRange: DateRange | undefined,
  year = 2026,
): boolean {
  return (
    videoCount > 0 &&
    videoCount < MIN_VIDEOS_FOR_QUARTER &&
    dateRange != null &&
    isQ2DateRange(dateRange, year)
  );
}
