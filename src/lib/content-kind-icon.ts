import type { ContentKind } from "./content-kind.js";

const ICON_PATHS: Record<ContentKind, string> = {
  podcast:
    '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/>',
  conference:
    '<path d="M3 4h18"/><rect x="4" y="4" width="16" height="11" rx="1"/><path d="M12 15v4"/><path d="M9 21l3-2 3 2"/>',
  channel:
    '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"/>',
  essay:
    '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/>',
};

export function contentKindIconSvg(kind: ContentKind): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[kind]}</svg>`;
}
