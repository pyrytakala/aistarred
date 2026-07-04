import type { PublicSource, SourcesManifest } from "./public-source.js";

export function sourcesManifestUrl(): string {
  return import.meta.env.DEV
    ? "/api/sources"
    : `${import.meta.env.BASE_URL}data/sources.json`;
}

export async function loadSourcesManifest(): Promise<SourcesManifest> {
  const response = await fetch(sourcesManifestUrl());
  if (!response.ok) {
    throw new Error(`Failed to load sources manifest (${response.status})`);
  }
  return response.json() as Promise<SourcesManifest>;
}

export function slugFromPathname(pathname = window.location.pathname): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "source") {
    return segments[1] ?? "";
  }
  return segments[0] ?? "";
}

export async function loadPublicSourceBySlug(slug: string): Promise<PublicSource> {
  const manifest = await loadSourcesManifest();
  const source = manifest.sources.find((entry) => entry.slug === slug);
  if (!source) {
    throw new Error(`Unknown source "${slug}"`);
  }
  return source;
}

export function rankingsUrlForSource(sourceId: string): string {
  return import.meta.env.DEV
    ? `/api/rankings/${sourceId}`
    : `${import.meta.env.BASE_URL}data/${sourceId}/rankings.json`;
}
