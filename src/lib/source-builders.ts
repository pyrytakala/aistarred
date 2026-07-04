import type { DateRange, SourceConfig } from "./sources-config.js";
import { halfYearDateRange } from "./half-year.js";

const QUARTER_PERIODS: Record<1 | 2 | 3 | 4, string> = {
  1: "Jan–Mar",
  2: "Apr–Jun",
  3: "Jul–Sep",
  4: "Oct–Dec",
};

export function quarterDateRange(year: number, quarter: 1 | 2 | 3 | 4): DateRange {
  const ranges: Record<1 | 2 | 3 | 4, DateRange> = {
    1: { since: `${year}0101`, until: `${year}0331` },
    2: { since: `${year}0401`, until: `${year}0630` },
    3: { since: `${year}0701`, until: `${year}0930` },
    4: { since: `${year}1001`, until: `${year}1231` },
  };
  return ranges[quarter];
}

export function calendarYearDateRange(year: number): DateRange {
  return { since: `${year}0101`, until: `${year}1231` };
}

export { halfYearDateRange } from "./half-year.js";

export interface QuarterlyPodcastSourceOptions {
  id: string;
  name: string;
  channelHandle?: string;
  /** Override default @handle/videos URL (e.g. YouTube playlists). */
  channelUrl?: string;
  coverImage: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  contentKind?: SourceConfig["contentKind"];
  /** @deprecated Ignored — sources use the full calendar year. */
  halfYear?: boolean;
  maxVideos?: number;
  /** Keep only videos whose title contains this substring. */
  youtubeTitleIncludes?: string;
}

export interface EssaySourceOptions {
  id: string;
  name: string;
  catalogUrl: string;
  coverImage: string;
  dateRange: DateRange;
  period: string;
  fetchAdapter?: SourceConfig["fetchAdapter"];
  feedUrl?: string;
  listingKind?: SourceConfig["essayListingKind"];
  channelName?: string;
  maxItems?: number;
  urlIncludes?: string;
}

export function essaySource(options: EssaySourceOptions): SourceConfig {
  const {
    id,
    name,
    catalogUrl,
    coverImage,
    dateRange,
    period,
    fetchAdapter = "rss-readability",
    feedUrl,
    listingKind = feedUrl ? "feed" : undefined,
    channelName,
    maxItems,
    urlIncludes,
  } = options;

  return {
    id,
    title: name,
    slug: id,
    channelUrl: catalogUrl,
    fetchKind: "essay",
    fetchAdapter,
    essayFeedUrl: feedUrl,
    essayListingKind: listingKind,
    essayChannelName: channelName ?? name,
    essayMaxItems: maxItems,
    essayUrlIncludes: urlIncludes,
    contentKind: "essay",
    coverImage,
    itemLabel: "posts",
    pageTitle: `${name} posts`,
    period,
    dateRange,
    maxDisplayAgeDays: null,
  };
}

export function quarterlyPodcastSource(
  options: QuarterlyPodcastSourceOptions,
): SourceConfig {
  const {
    id,
    name,
    channelHandle,
    channelUrl,
    coverImage,
    year,
    quarter,
    contentKind = "podcast",
    maxVideos,
    youtubeTitleIncludes,
  } = options;
  const title = `${name} — ${year}`;
  const pageTitles: Record<SourceConfig["contentKind"], string> = {
    conference: `${title} talks`,
    podcast: `${title} episodes`,
    channel: `${title} videos`,
    essay: `${title} posts`,
  };

  return {
    id,
    title,
    slug: id,
    channelUrl:
      channelUrl ??
      (channelHandle
        ? `https://www.youtube.com/@${channelHandle}/videos`
        : (() => {
            throw new Error(`channelHandle or channelUrl is required for ${id}`);
          })()),
    fetchKind: "youtube",
    contentKind,
    coverImage,
    itemLabel: "videos",
    pageTitle: pageTitles[contentKind],
    period: `${year}`,
    dateRange: calendarYearDateRange(year),
    fetchWindow: { months: 12 },
    maxVideos,
    youtubeTitleIncludes,
    maxDisplayAgeDays: null,
  };
}
