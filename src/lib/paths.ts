import { resolve } from "node:path";

export const ROOT = process.cwd();
export const TRANSCRIPTS_DIR = resolve(ROOT, "transcripts");
export const SCORES_DIR = resolve(ROOT, "scores");
export const CACHE_DIR = resolve(ROOT, ".cache", "api");
export const PROMPT_PATH = resolve(ROOT, "scoring_prompt.txt");

export interface SourcePaths {
  sourceId: string;
  transcriptsDir: string;
  scoresDir: string;
  indexPath: string;
  rankingsPath: string;
  publicRankingsPath: string;
}

export function sourcePaths(sourceId = "ai-engineer-worlds-fair-2026"): SourcePaths {
  const transcriptsDir = resolve(TRANSCRIPTS_DIR, sourceId);
  const scoresDir = resolve(SCORES_DIR, sourceId);
  return {
    sourceId,
    transcriptsDir,
    scoresDir,
    indexPath: resolve(transcriptsDir, "index.json"),
    rankingsPath: resolve(scoresDir, "rankings.json"),
    publicRankingsPath: resolve(ROOT, "public", "data", sourceId, "rankings.json"),
  };
}

// Legacy single-source paths (pre-migration)
export const INDEX_PATH = resolve(TRANSCRIPTS_DIR, "index.json");
export const RANKINGS_PATH = resolve(SCORES_DIR, "rankings.json");
export const PUBLIC_RANKINGS_PATH = resolve(ROOT, "public", "data", "rankings.json");
