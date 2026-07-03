import { isWithinDateRange } from "./date-range.js";
import type { SourceConfig } from "./sources.js";
import { isTooOldForDisplay } from "./video-age.js";

export function shouldDisplayVideo(
  uploadDate: string | null | undefined,
  source: Pick<SourceConfig, "maxDisplayAgeDays" | "dateRange">,
): boolean {
  if (source.maxDisplayAgeDays != null) {
    return !isTooOldForDisplay(uploadDate, source.maxDisplayAgeDays);
  }

  if (source.dateRange) {
    return isWithinDateRange(uploadDate, source.dateRange);
  }

  return true;
}
