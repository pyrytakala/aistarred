import { CONTENT_KIND_LABELS } from "./content-kind.js";
import type { SourceConfig } from "./sources-config.js";
import { categoriesForSource, primaryCategoryForSource, type SourceCategoryId } from "./source-categories.js";

export interface PublicSource {
  id: string;
  slug: string;
  title: string;
  pageTitle: string;
  contentKind: SourceConfig["contentKind"];
  itemLabel: string;
  coverImage: string;
  dateRange?: SourceConfig["dateRange"];
  maxDisplayAgeDays: number | null;
  rankedCount?: number;
  primaryCategory: SourceCategoryId;
  categories: SourceCategoryId[];
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
    dateRange: source.dateRange,
    maxDisplayAgeDays: source.maxDisplayAgeDays,
    primaryCategory: primaryCategoryForSource(source.id),
    categories: categoriesForSource(source.id),
  };
}

export function topPicksHeading(source: PublicSource): string {
  return CONTENT_KIND_LABELS[source.contentKind].topPicks;
}

export function contentKindLabels(source: PublicSource) {
  return CONTENT_KIND_LABELS[source.contentKind];
}
