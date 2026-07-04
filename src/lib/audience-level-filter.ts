import {
  AUDIENCE_LEVEL_LABELS,
  AUDIENCE_LEVELS,
  normalizeAudienceLevel,
  type AudienceLevel,
} from "./audience-level.js";
import {
  mountMultiSelectDropdown,
  type FilterDropdownHandle,
} from "./filter-dropdown.js";
import { multiSelectFilterSummary } from "./filter-summary.js";

export const AUDIENCE_LEVEL_FILTER_OPTIONS: AudienceLevel[] = [...AUDIENCE_LEVELS];

const LEVEL_PARAM = "level";

const LEVELS = new Set<AudienceLevel>(AUDIENCE_LEVEL_FILTER_OPTIONS);

function isAudienceLevel(value: string): value is AudienceLevel {
  return LEVELS.has(value as AudienceLevel);
}

export function readAudienceLevelFilter(): Set<AudienceLevel> {
  const param = new URLSearchParams(window.location.search).get(LEVEL_PARAM);
  if (!param) {
    return new Set();
  }

  const selected = param
    .split(",")
    .map((value) => value.trim())
    .filter(isAudienceLevel);

  return new Set(selected);
}

export function writeAudienceLevelFilter(selected: Set<AudienceLevel>): void {
  const url = new URL(window.location.href);
  if (selected.size === 0) {
    url.searchParams.delete(LEVEL_PARAM);
  } else {
    url.searchParams.set(
      LEVEL_PARAM,
      AUDIENCE_LEVEL_FILTER_OPTIONS.filter((level) => selected.has(level)).join(","),
    );
  }
  window.history.replaceState({}, "", url);
}

export function meetsAudienceLevelFilter(
  audienceLevel: AudienceLevel | string | null | undefined,
  selected: Set<AudienceLevel>,
): boolean {
  if (selected.size === 0) {
    return true;
  }

  const normalized =
    typeof audienceLevel === "string" && isAudienceLevel(audienceLevel)
      ? audienceLevel
      : normalizeAudienceLevel(audienceLevel);

  if (!normalized) {
    return false;
  }

  return selected.has(normalized);
}

function audienceLevelFilterSummary(selected: Set<AudienceLevel>) {
  const total = AUDIENCE_LEVEL_FILTER_OPTIONS.length;
  const singleLevel =
    selected.size === 1 ? AUDIENCE_LEVEL_FILTER_OPTIONS.find((level) => selected.has(level)) : null;

  return multiSelectFilterSummary({
    label: "Level",
    total,
    selected: selected.size,
    allValue: "All levels",
    singleValue: singleLevel ? `${AUDIENCE_LEVEL_LABELS[singleLevel]} only` : undefined,
    partialValue: `${selected.size}/${total} levels`,
  });
}

let levelDropdownHandle: FilterDropdownHandle | null = null;

export function mountAudienceLevelFilter(
  container: HTMLElement,
  selected: Set<AudienceLevel>,
  onChange: (selected: Set<AudienceLevel>) => void,
): void {
  levelDropdownHandle = mountMultiSelectDropdown(container, {
    ariaLabel: "Filter by audience level",
    summary: audienceLevelFilterSummary(selected),
    options: AUDIENCE_LEVEL_FILTER_OPTIONS.map((level) => ({
      value: level,
      label: AUDIENCE_LEVEL_LABELS[level],
    })),
    selectedValues: new Set(selected),
    onChange: (next) => {
      const selected = new Set([...next].filter(isAudienceLevel));
      writeAudienceLevelFilter(selected);
      levelDropdownHandle?.updateSummary(audienceLevelFilterSummary(selected));
      levelDropdownHandle?.updateSelection(new Set(selected));
      onChange(selected);
    },
  });
}

export function syncAudienceLevelFilter(
  container: HTMLElement,
  selected: Set<AudienceLevel>,
): void {
  void container;
  levelDropdownHandle?.updateSummary(audienceLevelFilterSummary(selected));
  levelDropdownHandle?.updateSelection(new Set(selected));
}
