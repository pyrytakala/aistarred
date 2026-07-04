import { mountSingleSelectDropdown, type FilterDropdownHandle } from "./filter-dropdown.js";
import type { SortMode } from "./ranked-list.js";

export const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "date", label: "Newest" },
  { value: "score", label: "Highest score" },
];

const SORT_PARAM = "sort";

export function readSortMode(): SortMode {
  const value = new URLSearchParams(window.location.search).get(SORT_PARAM);
  if (value === "score") {
    return "score";
  }
  return "date";
}

export function writeSortMode(mode: SortMode): void {
  const url = new URL(window.location.href);
  if (mode === "date") {
    url.searchParams.delete(SORT_PARAM);
  } else {
    url.searchParams.set(SORT_PARAM, mode);
  }
  window.history.replaceState({}, "", url);
}

function sortFilterSummary(mode: SortMode): string {
  const label = SORT_OPTIONS.find((option) => option.value === mode)?.label ?? "Newest";
  return `Sort: ${label}`;
}

let sortDropdownHandle: FilterDropdownHandle | null = null;

export function mountSortFilter(
  container: HTMLElement,
  selected: SortMode,
  onChange: (mode: SortMode) => void,
): void {
  sortDropdownHandle = mountSingleSelectDropdown(container, {
    ariaLabel: "Sort by",
    summary: sortFilterSummary(selected),
    options: SORT_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
    })),
    selectedValue: selected,
    onChange: (value) => {
      const mode = value === "score" ? "score" : "date";
      writeSortMode(mode);
      sortDropdownHandle?.updateSummary(sortFilterSummary(mode));
      sortDropdownHandle?.updateSelection(new Set([mode]));
      onChange(mode);
    },
  });
}

export function syncSortFilter(container: HTMLElement, selected: SortMode): void {
  void container;
  sortDropdownHandle?.updateSummary(sortFilterSummary(selected));
  sortDropdownHandle?.updateSelection(new Set([selected]));
}
