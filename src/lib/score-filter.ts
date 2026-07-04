import { displayScore } from "./score-bands.js";
import {
  mountSingleSelectDropdown,
  type FilterDropdownHandle,
} from "./filter-dropdown.js";

export type ScoreFilterMin = 7 | 8 | 9 | null;

export const SCORE_FILTER_OPTIONS: Array<{ value: ScoreFilterMin; label: string }> = [
  { value: null, label: "All scores" },
  { value: 7, label: ">7" },
  { value: 8, label: ">8" },
  { value: 9, label: ">9" },
];

const SCORE_PARAM = "score";

export type ScoreFilterContext = "feed" | "source";

function scoreFilterValue(min: ScoreFilterMin): string {
  return min == null ? "all" : String(min);
}

function scoreFilterFromValue(value: string): ScoreFilterMin {
  if (value === "7" || value === "8" || value === "9") {
    return Number(value) as 7 | 8 | 9;
  }
  return null;
}

export function readScoreFilter(context: ScoreFilterContext = "source"): ScoreFilterMin {
  const value = new URLSearchParams(window.location.search).get(SCORE_PARAM);
  if (value === "all") {
    return null;
  }
  if (value === "7" || value === "8" || value === "9") {
    return Number(value) as 7 | 8 | 9;
  }
  return context === "feed" ? 7 : null;
}

export function writeScoreFilter(
  min: ScoreFilterMin,
  context: ScoreFilterContext = "source",
): void {
  const url = new URL(window.location.href);
  if (min == null) {
    if (context === "feed") {
      url.searchParams.set(SCORE_PARAM, "all");
    } else {
      url.searchParams.delete(SCORE_PARAM);
    }
  } else if (context === "feed" && min === 7) {
    url.searchParams.delete(SCORE_PARAM);
  } else {
    url.searchParams.set(SCORE_PARAM, String(min));
  }
  window.history.replaceState({}, "", url);
}

export function meetsScoreFilter(
  composite: number | null | undefined,
  min: ScoreFilterMin,
): boolean {
  if (min == null) {
    return true;
  }
  if (composite == null || Number.isNaN(composite)) {
    return false;
  }
  return displayScore(composite) >= min;
}

export function scoreFilterLabel(min: ScoreFilterMin): string | null {
  if (min == null) {
    return null;
  }
  return SCORE_FILTER_OPTIONS.find((option) => option.value === min)?.label ?? null;
}

function scoreFilterSummary(min: ScoreFilterMin): string {
  const label = SCORE_FILTER_OPTIONS.find((option) => option.value === min)?.label ?? "All scores";
  return `Score: ${label}`;
}

let scoreDropdownHandle: FilterDropdownHandle | null = null;

export function mountScoreFilter(
  container: HTMLElement,
  selected: ScoreFilterMin,
  onChange: (min: ScoreFilterMin) => void,
  context: ScoreFilterContext = "source",
): void {
  scoreDropdownHandle = mountSingleSelectDropdown(container, {
    ariaLabel: "Filter by score",
    summary: scoreFilterSummary(selected),
    options: SCORE_FILTER_OPTIONS.map((option) => ({
      value: scoreFilterValue(option.value),
      label: option.label,
    })),
    selectedValue: scoreFilterValue(selected),
    onChange: (value) => {
      const min = scoreFilterFromValue(value);
      writeScoreFilter(min, context);
      scoreDropdownHandle?.updateSummary(scoreFilterSummary(min));
      scoreDropdownHandle?.updateSelection(new Set([value]));
      onChange(min);
    },
  });
}

export function syncScoreFilterButtons(container: HTMLElement, selected: ScoreFilterMin): void {
  void container;
  scoreDropdownHandle?.updateSummary(scoreFilterSummary(selected));
  scoreDropdownHandle?.updateSelection(new Set([scoreFilterValue(selected)]));
}
