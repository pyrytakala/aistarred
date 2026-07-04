import type { ContentKind } from "./content-kind.js";
import { CONTENT_KIND_LABELS } from "./content-kind.js";
import { contentKindIconSvg } from "./content-kind-icon.js";
import {
  mountMultiSelectDropdown,
  type FilterDropdownHandle,
} from "./filter-dropdown.js";

export const CONTENT_KIND_FILTER_OPTIONS: ContentKind[] = [
  "podcast",
  "essay",
  "channel",
  "conference",
];

const KIND_PARAM = "kind";

const CONTENT_KINDS = new Set<ContentKind>(CONTENT_KIND_FILTER_OPTIONS);

function isContentKind(value: string): value is ContentKind {
  return CONTENT_KINDS.has(value as ContentKind);
}

export function readContentKindFilter(): Set<ContentKind> {
  const param = new URLSearchParams(window.location.search).get(KIND_PARAM);
  if (!param) {
    return new Set();
  }

  const selected = param
    .split(",")
    .map((value) => value.trim())
    .filter(isContentKind);

  return new Set(selected);
}

export function writeContentKindFilter(selected: Set<ContentKind>): void {
  const url = new URL(window.location.href);
  if (selected.size === 0) {
    url.searchParams.delete(KIND_PARAM);
  } else {
    url.searchParams.set(
      KIND_PARAM,
      CONTENT_KIND_FILTER_OPTIONS.filter((kind) => selected.has(kind)).join(","),
    );
  }
  window.history.replaceState({}, "", url);
}

export function meetsContentKindFilter(kind: ContentKind, selected: Set<ContentKind>): boolean {
  if (selected.size === 0) {
    return true;
  }
  return selected.has(kind);
}

export function contentKindFilterLabel(selected: Set<ContentKind>): string | null {
  if (selected.size === 0) {
    return null;
  }

  return CONTENT_KIND_FILTER_OPTIONS.filter((kind) => selected.has(kind))
    .map((kind) => CONTENT_KIND_LABELS[kind].kind)
    .join(", ");
}

function contentKindFilterSummary(selected: Set<ContentKind>): string {
  if (selected.size === 0) {
    return "Type: All types";
  }
  const labels = CONTENT_KIND_FILTER_OPTIONS.filter((kind) => selected.has(kind)).map(
    (kind) => CONTENT_KIND_LABELS[kind].kind,
  );
  return `Type: ${labels.join(", ")}`;
}

let kindDropdownHandle: FilterDropdownHandle | null = null;

export function mountContentKindFilter(
  container: HTMLElement,
  selected: Set<ContentKind>,
  onChange: (selected: Set<ContentKind>) => void,
): void {
  kindDropdownHandle = mountMultiSelectDropdown(container, {
    ariaLabel: "Filter by content type",
    summary: contentKindFilterSummary(selected),
    options: CONTENT_KIND_FILTER_OPTIONS.map((kind) => ({
      value: kind,
      label: CONTENT_KIND_LABELS[kind].kind,
      iconHtml: contentKindIconSvg(kind),
    })),
    selectedValues: new Set(selected),
    onChange: (next) => {
      const selected = new Set(
        [...next].filter(isContentKind),
      ) as Set<ContentKind>;
      writeContentKindFilter(selected);
      kindDropdownHandle?.updateSummary(contentKindFilterSummary(selected));
      kindDropdownHandle?.updateSelection(new Set(selected));
      onChange(selected);
    },
  });
}

export function syncContentKindFilterButtons(
  container: HTMLElement,
  selected: Set<ContentKind>,
): void {
  void container;
  kindDropdownHandle?.updateSummary(contentKindFilterSummary(selected));
  kindDropdownHandle?.updateSelection(new Set(selected));
}
