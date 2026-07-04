import { daysSinceUpload } from "./video-age.js";
import { mountSingleSelectDropdown, type FilterDropdownHandle } from "./filter-dropdown.js";
import { filterSummary } from "./filter-summary.js";

export type TimeFilterDays = 7 | 30 | 90 | null;

export const TIME_FILTER_OPTIONS: Array<{ value: TimeFilterDays; label: string }> = [
  { value: null, label: "All time" },
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

const TIME_PARAM = "time";

function timeFilterValue(days: TimeFilterDays): string {
  return days == null ? "all" : String(days);
}

function timeFilterFromValue(value: string): TimeFilterDays {
  if (value === "7" || value === "30" || value === "90") {
    return Number(value) as 7 | 30 | 90;
  }
  return null;
}

export function readTimeFilter(): TimeFilterDays {
  const value = new URLSearchParams(window.location.search).get(TIME_PARAM);
  if (value === "7" || value === "30" || value === "90") {
    return Number(value) as 7 | 30 | 90;
  }
  return null;
}

export function writeTimeFilter(days: TimeFilterDays): void {
  const url = new URL(window.location.href);
  if (days == null) {
    url.searchParams.delete(TIME_PARAM);
  } else {
    url.searchParams.set(TIME_PARAM, String(days));
  }
  window.history.replaceState({}, "", url);
}

export function meetsTimeFilter(
  uploadDate: string | null | undefined,
  maxDays: TimeFilterDays,
): boolean {
  if (maxDays == null) {
    return true;
  }

  const ageDays = daysSinceUpload(uploadDate);
  if (ageDays == null) {
    return false;
  }

  return ageDays <= maxDays;
}

function timeFilterSummary(days: TimeFilterDays) {
  const label =
    TIME_FILTER_OPTIONS.find((option) => option.value === days)?.label ?? "All time";
  return filterSummary("Time", label, days != null);
}

let timeDropdownHandle: FilterDropdownHandle | null = null;

export function mountTimeFilter(
  container: HTMLElement,
  selected: TimeFilterDays,
  onChange: (days: TimeFilterDays) => void,
): void {
  timeDropdownHandle = mountSingleSelectDropdown(container, {
    ariaLabel: "Filter by time",
    summary: timeFilterSummary(selected),
    options: TIME_FILTER_OPTIONS.map((option) => ({
      value: timeFilterValue(option.value),
      label: option.label,
    })),
    selectedValue: timeFilterValue(selected),
    onChange: (value) => {
      const days = timeFilterFromValue(value);
      writeTimeFilter(days);
      timeDropdownHandle?.updateSummary(timeFilterSummary(days));
      timeDropdownHandle?.updateSelection(new Set([timeFilterValue(days)]));
      onChange(days);
    },
  });
}

export function syncTimeFilter(container: HTMLElement, selected: TimeFilterDays): void {
  void container;
  timeDropdownHandle?.updateSummary(timeFilterSummary(selected));
  timeDropdownHandle?.updateSelection(new Set([timeFilterValue(selected)]));
}
