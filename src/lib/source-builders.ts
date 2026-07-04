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

export { halfYearDateRange } from "./half-year.js";

export interface QuarterlyPodcastSourceOptions {
  id: string;
  name: string;
  channelHandle: string;
  coverImage: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  contentKind?: SourceConfig["contentKind"];
  /** Use Jan–Jun (Q1+Q2) instead of a single quarter. */
  halfYear?: boolean;
}

export function quarterlyPodcastSource(
  options: QuarterlyPodcastSourceOptions,
): SourceConfig {
  const {
    id,
    name,
    channelHandle,
    coverImage,
    year,
    quarter,
    contentKind = "podcast",
    halfYear = false,
  } = options;
  const title = halfYear ? `${name} — H1 ${year}` : `${name} — Q${quarter} ${year}`;
  const pageTitles: Record<SourceConfig["contentKind"], string> = {
    conference: `${title} talks`,
    podcast: `${title} episodes`,
    channel: `${title} videos`,
  };
  const usesTalkPrompt = contentKind === "conference" || contentKind === "channel";

  return {
    id,
    title,
    slug: id,
    channelUrl: `https://www.youtube.com/@${channelHandle}/videos`,
    contentKind,
    coverImage,
    itemLabel: "videos",
    pageTitle: pageTitles[contentKind],
    period: halfYear ? `Jan–Jun ${year}` : `${QUARTER_PERIODS[quarter]} ${year}`,
    promptFile: usesTalkPrompt ? "scoring_prompt.txt" : "scoring_prompt_podcast.txt",
    dateRange: halfYear ? halfYearDateRange(year) : quarterDateRange(year, quarter),
    fetchWindow: { months: halfYear ? 7 : 4 },
    maxDisplayAgeDays: null,
  };
}
