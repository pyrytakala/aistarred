import { quarterlyPodcastSource, essaySource } from "./source-builders.js";

/**
 * Active sources shown on the site. For inclusion/exclusion notes, see source-registry.ts.
 */

export interface DateRange {
  since: string;
  until: string;
}

export type FetchKind = "youtube" | "essay";

export interface SourceConfig {
  id: string;
  title: string;
  slug: string;
  channelUrl: string;
  fetchKind: FetchKind;
  fetchAdapter?: "paul-graham";
  contentKind: "conference" | "podcast" | "channel" | "essay";
  coverImage: string;
  itemLabel: string;
  pageTitle: string;
  period?: string;
  location?: string;
  dateRange?: DateRange;
  fetchWindow?: { days?: number; months?: number };
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
