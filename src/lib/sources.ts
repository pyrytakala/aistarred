import { resolve } from "node:path";

export interface DateRange {
  since: string;
  until: string;
}

export interface SourceConfig {
  id: string;
  title: string;
  slug: string;
  channelUrl: string;
  itemLabel: string;
  pageTitle: string;
  landingMeta?: string;
  promptFile: string;
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
    itemLabel: "videos",
    pageTitle: "Top picks: AI Engineer World's Fair 2026",
    landingMeta: "San Francisco · top third by quality",
    promptFile: "scoring_prompt.txt",
    fetchWindow: { days: 10 },
    maxDisplayAgeDays: 10,
  },
  "latent-space-pod-q2-2026": {
    id: "latent-space-pod-q2-2026",
    title: "Latent Space Pod — Q2 2026",
    slug: "latent-space-pod-q2-2026",
    channelUrl: "https://www.youtube.com/@LatentSpacePod/videos",
    itemLabel: "videos",
    pageTitle: "Top picks: Latent Space Pod — Q2 2026",
    landingMeta: "Apr–Jun 2026",
    promptFile: "scoring_prompt_podcast.txt",
    dateRange: { since: "20260401", until: "20260630" },
    fetchWindow: { months: 4 },
    maxDisplayAgeDays: null,
  },
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

export function resolveSourceIdFromArgv(argv: string[]): string {
  const allSources = argv.includes("--all-sources");
  if (allSources) {
    return "";
  }
  const index = argv.indexOf("--source");
  if (index >= 0 && argv[index + 1]) {
    return argv[index + 1];
  }
  return DEFAULT_SOURCE_ID;
}

export function resolveSourceIdsFromArgv(argv: string[]): string[] {
  if (argv.includes("--all-sources")) {
    return listSources().map((source) => source.id);
  }
  const index = argv.indexOf("--source");
  if (index >= 0 && argv[index + 1]) {
    return [argv[index + 1]];
  }
  return listSources().map((source) => source.id);
}

export function promptPathForSource(source: SourceConfig): string {
  return resolve(process.cwd(), source.promptFile);
}
