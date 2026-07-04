import { CONTENT_KIND_LABELS } from "./content-kind.js";
import type { SourceConfig } from "./sources-config.js";

export interface PublicSource {
  id: string;
  slug: string;
  title: string;
  pageTitle: string;
  contentKind: SourceConfig["contentKind"];
  itemLabel: string;
  coverImage: string;
  period?: string;
  location?: string;
  dateRange?: SourceConfig["dateRange"];
  maxDisplayAgeDays: number | null;
  rankedCount?: number;
}

export interface SourcesManifest {
  sources: PublicSource[];
}

export function toPublicSource(source: SourceConfig): PublicSource {
  return {
    id: source.id,
    slug: source.slug,
    title: source.title,
    pageTitle: source.pageTitle,
    contentKind: source.contentKind,
    itemLabel: source.itemLabel,
    coverImage: source.coverImage,
    period: source.period,
    location: source.location,
    dateRange: source.dateRange,
    maxDisplayAgeDays: source.maxDisplayAgeDays,
  };
}

export function sourceSubtitle(source: PublicSource): string {
  const parts: string[] = [];
  if (source.period) {
    parts.push(source.period);
  }
  if (source.location) {
    parts.push(source.location);
  }
  return parts.join(" · ");
}

export function topPicksHeading(source: PublicSource): string {
  return CONTENT_KIND_LABELS[source.contentKind].topPicks;
}

export function contentKindLabels(source: PublicSource) {
  return CONTENT_KIND_LABELS[source.contentKind];
}
