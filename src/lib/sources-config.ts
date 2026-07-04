import { quarterlyPodcastSource, essaySource } from "./source-builders.js";

/**
 * Active sources shown on the site. For inclusion/exclusion notes, see source-registry.ts.
 */

export interface DateRange {
  since: string;
  until: string;
}

export type FetchKind = "youtube" | "essay";

export type EssayFetchAdapter = "paul-graham" | "rss-readability";

export type EssayListingKind =
  | "feed"
  | "gwern-index"
  | "anthropic-engineering"
  | "openai-blog"
  | "hamel-index"
  | "machine-theory-journal"
  | "semianalysis-archives";

export interface SourceConfig {
  id: string;
  title: string;
  slug: string;
  channelUrl: string;
  fetchKind: FetchKind;
  fetchAdapter?: EssayFetchAdapter;
  essayFeedUrl?: string;
  essayListingKind?: EssayListingKind;
  essayChannelName?: string;
  essayMaxItems?: number;
  essayUrlIncludes?: string;
  contentKind: "conference" | "podcast" | "channel" | "essay";
  coverImage: string;
  itemLabel: string;
  pageTitle: string;
  period?: string;
  location?: string;
  dateRange?: DateRange;
  fetchWindow?: { days?: number; months?: number };
  maxVideos?: number;
  youtubeTitleIncludes?: string;
  maxDisplayAgeDays: number | null;
}

export const SOURCES: Record<string, SourceConfig> = {
  "ai-engineer-worlds-fair-2026": {
    id: "ai-engineer-worlds-fair-2026",
    title: "AI Engineer World's Fair 2026",
    slug: "ai-engineer-worlds-fair-2026",
    channelUrl: "https://www.youtube.com/@aiDotEngineer/videos",
    fetchKind: "youtube",
    contentKind: "conference",
    coverImage: "/images/covers/ai-engineer-worlds-fair-2026.jpg",
    itemLabel: "videos",
    pageTitle: "AI Engineer World's Fair 2026 talks",
    period: "Jun 2026",
    location: "San Francisco",
    fetchWindow: { days: 10 },
    maxDisplayAgeDays: 10,
  },
  "latent-space-pod-q2-2026": quarterlyPodcastSource({
    id: "latent-space-pod-q2-2026",
    name: "Latent Space Pod",
    channelHandle: "LatentSpacePod",
    coverImage: "/images/covers/latent-space-pod.png",
    year: 2026,
    quarter: 2,
  }),
  "no-priors-pod-q2-2026": quarterlyPodcastSource({
    id: "no-priors-pod-q2-2026",
    name: "No Priors Pod",
    channelHandle: "NoPriorsPodcast",
    coverImage: "/images/covers/no-priors-pod.png",
    year: 2026,
    quarter: 2,
  }),
  "twiml-ai-pod-q2-2026": quarterlyPodcastSource({
    id: "twiml-ai-pod-q2-2026",
    name: "The TWIML AI Podcast",
    channelHandle: "twimlai",
    coverImage: "/images/covers/twiml-ai-pod.png",
    year: 2026,
    quarter: 2,
  }),
  "cognitive-revolution-pod-q2-2026": quarterlyPodcastSource({
    id: "cognitive-revolution-pod-q2-2026",
    name: "The Cognitive Revolution Podcast",
    channelHandle: "CognitiveRevolutionPodcast",
    coverImage: "/images/covers/cognitive-revolution-pod.png",
    year: 2026,
    quarter: 2,
  }),
  "nvidia-q2-2026": quarterlyPodcastSource({
    id: "nvidia-q2-2026",
    name: "NVIDIA",
    channelHandle: "NVIDIA",
    coverImage: "/images/covers/nvidia.png",
    year: 2026,
    quarter: 2,
    contentKind: "channel",
  }),
  "a16z-q2-2026": quarterlyPodcastSource({
    id: "a16z-q2-2026",
    name: "a16z",
    channelHandle: "a16z",
    coverImage: "/images/covers/a16z.png",
    year: 2026,
    quarter: 2,
  }),
  "ml-street-talk-q2-2026": quarterlyPodcastSource({
    id: "ml-street-talk-q2-2026",
    name: "Machine Learning Street Talk",
    channelHandle: "MachineLearningStreetTalk",
    coverImage: "/images/covers/ml-street-talk.png",
    year: 2026,
    quarter: 2,
    halfYear: true,
  }),
  "huberman-lab-h1-2026": quarterlyPodcastSource({
    id: "huberman-lab-h1-2026",
    name: "Huberman Lab",
    channelHandle: "HubermanLab",
    coverImage: "/images/covers/huberman-lab.png",
    year: 2026,
    quarter: 2,
    halfYear: true,
  }),
  "paul-graham-essays-2020s": essaySource({
    id: "paul-graham-essays-2020s",
    name: "Paul Graham Essays",
    catalogUrl: "https://paulgraham.com/articles.html",
    coverImage: "/images/covers/paul-graham.png",
    dateRange: { since: "20200101", until: "20291231" },
    period: "2020s",
    fetchAdapter: "paul-graham",
    channelName: "Paul Graham",
  }),
  "swyx-io-2026": essaySource({
    id: "swyx-io-2026",
    name: "swyx.io",
    catalogUrl: "https://swyx.io/rss.xml",
    feedUrl: "https://swyx.io/rss.xml",
    coverImage: "/images/covers/swyx-io.png",
    dateRange: { since: "20260101", until: "20261231" },
    period: "2026",
    listingKind: "feed",
    channelName: "swyx.io",
  }),
  "gwern-blog-2025-2026": essaySource({
    id: "gwern-blog-2025-2026",
    name: "Gwern.net Blog",
    catalogUrl: "https://gwern.net/blog/index",
    coverImage: "/images/covers/gwern.png",
    dateRange: { since: "20250101", until: "20261231" },
    period: "2025–2026",
    listingKind: "gwern-index",
    channelName: "Gwern",
  }),
  "simon-willison-h1-2026": essaySource({
    id: "simon-willison-h1-2026",
    name: "Simon Willison",
    catalogUrl: "https://simonwillison.net/atom/everything/",
    feedUrl: "https://simonwillison.net/atom/everything/",
    coverImage: "/images/covers/simon-willison.png",
    dateRange: { since: "20260101", until: "20261231" },
    period: "2026",
    listingKind: "feed",
    channelName: "Simon Willison",
  }),
  "anthropic-engineering-h1-2026": essaySource({
    id: "anthropic-engineering-h1-2026",
    name: "Anthropic Engineering",
    catalogUrl: "https://www.anthropic.com/engineering",
    coverImage: "/images/covers/anthropic-engineering.png",
    dateRange: { since: "20260101", until: "20261231" },
    period: "2026",
    listingKind: "anthropic-engineering",
    channelName: "Anthropic Engineering",
  }),
  "openai-developer-blog-h1-2026": essaySource({
    id: "openai-developer-blog-h1-2026",
    name: "OpenAI Developer Blog",
    catalogUrl: "https://developers.openai.com/blog",
    coverImage: "/images/covers/openai-developer-blog.png",
    dateRange: { since: "20260101", until: "20261231" },
    period: "2026",
    listingKind: "openai-blog",
    channelName: "OpenAI Developer Blog",
  }),
  "stratechery-h1-2026": essaySource({
    id: "stratechery-h1-2026",
    name: "Stratechery",
    catalogUrl: "https://stratechery.com/feed/",
    feedUrl: "https://stratechery.com/feed/",
    coverImage: "/images/covers/stratechery.png",
    dateRange: { since: "20260101", until: "20261231" },
    period: "2026",
    listingKind: "feed",
    channelName: "Stratechery",
  }),
  "import-ai-h1-2026": essaySource({
    id: "import-ai-h1-2026",
    name: "Import AI",
    catalogUrl: "https://importai.substack.com/feed",
    feedUrl: "https://importai.substack.com/feed",
    coverImage: "/images/covers/import-ai.png",
    dateRange: { since: "20260101", until: "20261231" },
    period: "2026",
    listingKind: "feed",
    channelName: "Import AI",
  }),
  "hamel-dev-h1-2026": essaySource({
    id: "hamel-dev-h1-2026",
    name: "Hamel Husain",
    catalogUrl: "https://hamel.dev/",
    coverImage: "/images/covers/hamel-dev.png",
    dateRange: { since: "20260101", until: "20261231" },
    period: "2026",
    listingKind: "hamel-index",
    channelName: "Hamel Husain",
  }),
  "machine-theory-journal-h1-2026": essaySource({
    id: "machine-theory-journal-h1-2026",
    name: "Machine Theory Journal",
    catalogUrl: "https://machine-theory.com/journal/",
    coverImage: "/images/covers/machine-theory.png",
    dateRange: { since: "20260101", until: "20261231" },
    period: "2026",
    listingKind: "machine-theory-journal",
    channelName: "kwindla",
  }),
  "semianalysis-q2-2026": essaySource({
    id: "semianalysis-q2-2026",
    name: "SemiAnalysis",
    catalogUrl: "https://newsletter.semianalysis.com/",
    feedUrl: "https://newsletter.semianalysis.com/feed",
    coverImage: "/images/covers/semianalysis.png",
    dateRange: { since: "20260101", until: "20261231" },
    period: "2026",
    listingKind: "feed",
    channelName: "SemiAnalysis",
  }),
  "bens-bites-q2-2026": essaySource({
    id: "bens-bites-q2-2026",
    name: "Ben's Bites",
    catalogUrl: "https://www.bensbites.com/feed",
    feedUrl: "https://www.bensbites.com/feed",
    coverImage: "/images/covers/bens-bites.png",
    dateRange: { since: "20260101", until: "20261231" },
    period: "2026",
    listingKind: "feed",
    channelName: "Ben's Bites",
  }),
  "pragmatic-engineer-2026": essaySource({
    id: "pragmatic-engineer-2026",
    name: "The Pragmatic Engineer",
    catalogUrl: "https://blog.pragmaticengineer.com/rss/",
    feedUrl: "https://blog.pragmaticengineer.com/rss/",
    coverImage: "/images/covers/pragmatic-engineer.png",
    dateRange: { since: "20260101", until: "20261231" },
    period: "2026",
    listingKind: "feed",
    channelName: "The Pragmatic Engineer",
  }),
  "construction-physics-q2-2026": essaySource({
    id: "construction-physics-q2-2026",
    name: "Construction Physics",
    catalogUrl: "https://www.construction-physics.com/feed",
    feedUrl: "https://www.construction-physics.com/feed",
    coverImage: "/images/covers/construction-physics.png",
    dateRange: { since: "20260101", until: "20261231" },
    period: "2026",
    listingKind: "feed",
    channelName: "Construction Physics",
  }),
  "asterisk-issue-14-latest": essaySource({
    id: "asterisk-issue-14-latest",
    name: "Asterisk — Issue 14",
    catalogUrl: "https://asteriskmag.com/feed",
    feedUrl: "https://asteriskmag.com/feed",
    coverImage: "/images/covers/asterisk.png",
    dateRange: { since: "20260101", until: "20261231" },
    period: "2026",
    listingKind: "feed",
    channelName: "Asterisk",
    maxItems: 5,
    urlIncludes: "/issues/14/",
  }),
  "odd-lots-q2-2026": quarterlyPodcastSource({
    id: "odd-lots-q2-2026",
    name: "Odd Lots",
    channelUrl:
      "https://www.youtube.com/playlist?list=PLe4PRejZgr0MuA6M0zkZyy-99-qc87wKV",
    coverImage: "/images/covers/odd-lots.png",
    year: 2026,
    quarter: 2,
  }),
  "yc-startup-pod-q2-2026": quarterlyPodcastSource({
    id: "yc-startup-pod-q2-2026",
    name: "YC Startup Podcast",
    channelHandle: "YCombinator",
    coverImage: "/images/covers/y-combinator.png",
    year: 2026,
    quarter: 2,
  }),
  "my-first-million-q2-2026": quarterlyPodcastSource({
    id: "my-first-million-q2-2026",
    name: "My First Million",
    channelHandle: "MyFirstMillionPod",
    coverImage: "/images/covers/my-first-million.png",
    year: 2026,
    quarter: 2,
  }),
  "pmf-show-q2-2026": quarterlyPodcastSource({
    id: "pmf-show-q2-2026",
    name: "The PMF Show",
    channelHandle: "pmfshow",
    coverImage: "/images/covers/pmf-show.png",
    year: 2026,
    quarter: 2,
  }),
  "how-i-built-this-q2-2026": essaySource({
    id: "how-i-built-this-q2-2026",
    name: "How I Built This",
    catalogUrl: "https://rss.art19.com/how-i-built-this",
    feedUrl: "https://rss.art19.com/how-i-built-this",
    coverImage: "/images/covers/how-i-built-this.png",
    dateRange: { since: "20260101", until: "20261231" },
    period: "2026",
    listingKind: "feed",
    channelName: "How I Built This",
  }),
  "lennys-podcast-q2-2026": quarterlyPodcastSource({
    id: "lennys-podcast-q2-2026",
    name: "Lenny's Podcast",
    channelHandle: "LennysPodcast",
    coverImage: "/images/covers/lennys-podcast.png",
    year: 2026,
    quarter: 2,
  }),
  "nateliason-q2-2026": essaySource({
    id: "nateliason-q2-2026",
    name: "Nat Eliason",
    catalogUrl: "https://blog.nateliason.com/",
    feedUrl: "https://blog.nateliason.com/feed",
    coverImage: "/images/covers/nateliason.png",
    dateRange: { since: "20260101", until: "20261231" },
    period: "2026",
    listingKind: "feed",
    channelName: "Nat Eliason",
  }),
  "founders-podcast-q2-2026": quarterlyPodcastSource({
    id: "founders-podcast-q2-2026",
    name: "Founders Podcast",
    channelHandle: "founderspodcast1",
    coverImage: "/images/covers/founders-podcast.png",
    year: 2026,
    quarter: 2,
  }),
  "peter-attia-q2-2026": quarterlyPodcastSource({
    id: "peter-attia-q2-2026",
    name: "Peter Attia MD",
    channelHandle: "PeterAttiaMD",
    coverImage: "/images/covers/peter-attia.png",
    year: 2026,
    quarter: 2,
  }),
  "modern-wisdom-q2-2026": quarterlyPodcastSource({
    id: "modern-wisdom-q2-2026",
    name: "Modern Wisdom",
    channelUrl: "https://www.youtube.com/channel/UCIaH-gZIVC432YRjNVvnyCA/videos",
    coverImage: "/images/covers/modern-wisdom.png",
    year: 2026,
    quarter: 2,
  }),
  "greg-isenberg-q2-2026": quarterlyPodcastSource({
    id: "greg-isenberg-q2-2026",
    name: "Greg Isenberg",
    channelHandle: "GregIsenberg",
    coverImage: "/images/covers/greg-isenberg.png",
    year: 2026,
    quarter: 2,
    contentKind: "channel",
  }),
  "iltb-podcast-q2-2026": quarterlyPodcastSource({
    id: "iltb-podcast-q2-2026",
    name: "Invest Like the Best",
    channelHandle: "ILTB_Podcast",
    coverImage: "/images/covers/iltb-podcast.png",
    year: 2026,
    quarter: 2,
  }),
};

export const DEFAULT_SOURCE_ID = "ai-engineer-worlds-fair-2026";

export function getSource(sourceId?: string | null): SourceConfig {
  const id = sourceId?.trim() || DEFAULT_SOURCE_ID;
  const source = SOURCES[id];
  if (!source) {
    const available = Object.keys(SOURCES).join(", ");
    throw new Error(`Unknown source "${id}". Available: ${available}`);
  }
  return source;
}

export function listSources(): SourceConfig[] {
  return Object.values(SOURCES);
}
