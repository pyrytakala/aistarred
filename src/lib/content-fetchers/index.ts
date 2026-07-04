import type { SourceConfig } from "../sources-config.js";
import { paulGrahamFetcher } from "./paul-graham.js";
import type { ContentFetcher } from "./types.js";

export type { ContentFetchContext, ContentFetcher, ContentListItem } from "./types.js";

export function getContentFetcher(source: Pick<SourceConfig, "fetchKind" | "fetchAdapter">): ContentFetcher {
  if (source.fetchKind === "essay") {
    if (source.fetchAdapter === "paul-graham") {
      return paulGrahamFetcher;
    }
    throw new Error(`Unknown essay fetch adapter "${source.fetchAdapter}"`);
  }

  throw new Error(`No content fetcher for fetchKind "${source.fetchKind}"`);
}

export function usesEssayFetch(source: Pick<SourceConfig, "fetchKind">): boolean {
  return source.fetchKind === "essay";
}
