import {
  mountGroupedMultiSelectDropdown,
  type FilterDropdownHandle,
  type GroupedMultiSelectGroup,
  type GroupedMultiSelectLeaf,
} from "./filter-dropdown.js";
import { filterSummary, multiSelectFilterSummary } from "./filter-summary.js";
import type { PublicSource } from "./public-source.js";
import {
  primaryCategoryForSource,
  SOURCE_CATEGORIES,
  sourcesInCategory,
} from "./source-categories.js";

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

  const fullySelectedCategories = SOURCE_CATEGORIES.filter((category) => {
    const members = sourcesInCategory(
      sorted.map((source) => source.id),
      category.id,
    ).map((id) => sorted.find((source) => source.id === id)?.slug ?? id);
    return members.length > 0 && members.every((slug) => selected.has(slug));
  });

  if (fullySelectedCategories.length === 1) {
    const category = fullySelectedCategories[0];
    const memberSlugs = sourcesInCategory(
      sorted.map((source) => source.id),
      category.id,
    ).map((id) => sorted.find((source) => source.id === id)?.slug ?? id);
    const onlyCategory =
      memberSlugs.length > 0 &&
      selected.size === memberSlugs.length &&
      memberSlugs.every((slug) => selected.has(slug));
    if (onlyCategory) {
      return filterSummary("Sources", category.label, true);
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

function sourceOptionLabel(source: PublicSource): string {
  if (source.rankedCount == null) {
    return source.title;
  }
  return `${source.title} (${source.rankedCount})`;
}

function buildGroupedOptions(sources: PublicSource[]): {
  groups: GroupedMultiSelectGroup[];
  leaves: GroupedMultiSelectLeaf[];
} {
  const sorted = sortedSources(sources);
  const sourceIds = sorted.map((source) => source.id);
  const groups: GroupedMultiSelectGroup[] = SOURCE_CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    memberValues: sourcesInCategory(sourceIds, category.id).map(
      (id) => sorted.find((source) => source.id === id)?.slug ?? id,
    ),
  })).filter((group) => group.memberValues.length > 0);

  const leaves: GroupedMultiSelectLeaf[] = [];
  for (const category of SOURCE_CATEGORIES) {
    for (const source of sorted) {
      const primary = source.primaryCategory ?? primaryCategoryForSource(source.id);
      if (primary !== category.id) {
        continue;
      }
      leaves.push({
        value: source.slug,
        label: sourceOptionLabel(source),
        groupId: category.id,
        searchText: `${source.title} ${source.slug} ${category.label}`,
      });
    }
  }

  return { groups, leaves };
}

let sourceDropdownHandle: FilterDropdownHandle | null = null;

export function mountFeedSourceFilter(
  container: HTMLElement,
  sources: PublicSource[],
  selected: Set<string>,
  onChange: (selected: Set<string>) => void,
): void {
  const sorted = sortedSources(sources);
  const { groups, leaves } = buildGroupedOptions(sorted);
  container.classList.add("filter-dropdown-wrap--sources");

  sourceDropdownHandle = mountGroupedMultiSelectDropdown(container, {
    ariaLabel: "Filter by source",
    summary: sourceFilterSummary(sorted, selected),
    panelClassName: "filter-dropdown-panel--wide",
    groups,
    leaves,
    selectedValues: new Set(selected),
    bulkActions: {},
    search: { placeholder: "Search sources…" },
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
