import {
  mountMultiSelectDropdown,
  type FilterDropdownHandle,
} from "./filter-dropdown.js";
import { filterSummary, multiSelectFilterSummary } from "./filter-summary.js";
import type { PublicSource } from "./public-source.js";

const SOURCE_PARAM = "source";

function sortedSources(sources: PublicSource[]): PublicSource[] {
  return [...sources].sort((a, b) => a.title.localeCompare(b.title));
}

export function readFeedSourceFilter(validSlugs?: Set<string>): Set<string> {
  const param = new URLSearchParams(window.location.search).get(SOURCE_PARAM);
  if (!param) {
    return new Set();
  }

  const selected = param
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!validSlugs) {
    return new Set(selected);
  }

  return new Set(selected.filter((slug) => validSlugs.has(slug)));
}

export function writeFeedSourceFilter(
  selected: Set<string>,
  sources: PublicSource[],
): void {
  const url = new URL(window.location.href);
  if (selected.size === 0) {
    url.searchParams.delete(SOURCE_PARAM);
  } else {
    const ordered = sortedSources(sources)
      .map((source) => source.slug)
      .filter((slug) => selected.has(slug));
    url.searchParams.set(SOURCE_PARAM, ordered.join(","));
  }
  window.history.replaceState({}, "", url);
}

export function meetsFeedSourceFilter(sourceSlug: string, selected: Set<string>): boolean {
  if (selected.size === 0) {
    return true;
  }
  return selected.has(sourceSlug);
}

function sourceFilterSummary(sources: PublicSource[], selected: Set<string>) {
  const sorted = sortedSources(sources);
  const total = sorted.length;

  if (selected.size === 0) {
    return filterSummary("Sources", "All sources");
  }

  if (selected.size === 1) {
    const title = sorted.find((source) => selected.has(source.slug))?.title;
    if (title) {
      return filterSummary("Sources", title, true);
    }
  }

  return multiSelectFilterSummary({
    label: "Sources",
    total,
    selected: selected.size,
    allValue: "All sources",
    partialValue: `${selected.size} sources selected`,
  });
}

let sourceDropdownHandle: FilterDropdownHandle | null = null;

export function mountFeedSourceFilter(
  container: HTMLElement,
  sources: PublicSource[],
  selected: Set<string>,
  onChange: (selected: Set<string>) => void,
): void {
  const sorted = sortedSources(sources);

  sourceDropdownHandle = mountMultiSelectDropdown(container, {
    ariaLabel: "Filter by source",
    summary: sourceFilterSummary(sorted, selected),
    options: sorted.map((source) => ({
      value: source.slug,
      label: source.title,
    })),
    selectedValues: new Set(selected),
    onChange: (next) => {
      const selected = new Set([...next].filter((slug) => sorted.some((source) => source.slug === slug)));
      writeFeedSourceFilter(selected, sorted);
      sourceDropdownHandle?.updateSummary(sourceFilterSummary(sorted, selected));
      sourceDropdownHandle?.updateSelection(new Set(selected));
      onChange(selected);
    },
  });
}

export function syncFeedSourceFilter(
  container: HTMLElement,
  sources: PublicSource[],
  selected: Set<string>,
): void {
  void container;
  sourceDropdownHandle?.updateSummary(sourceFilterSummary(sources, selected));
  sourceDropdownHandle?.updateSelection(new Set(selected));
}
