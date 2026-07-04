import type { DateRange } from "../sources-config.js";
import type { VideoIndexEntry } from "../types.js";

/** Listed item before text is downloaded. */
export interface ContentListItem {
  id: string;
  title: string;
  url: string;
  upload_date?: string | null;
  description?: string | null;
  duration_seconds?: number | null;
}

export interface ContentFetchContext {
  sourceId: string;
  sourceUrl: string;
  dateRange?: DateRange;
  outputDir: string;
  requestDelayMs: number;
  maxItems?: number | null;
}

export interface ContentFetcher {
  kind: string;
  listItems(context: ContentFetchContext): Promise<ContentListItem[]>;
  fetchItem(
    item: ContentListItem,
    context: ContentFetchContext,
    usedNames: Set<string>,
  ): Promise<VideoIndexEntry>;
}
