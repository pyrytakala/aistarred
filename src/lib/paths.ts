import { resolve } from "node:path";

export const ROOT = process.cwd();
export const TRANSCRIPTS_DIR = resolve(ROOT, "transcripts");
export const SCORES_DIR = resolve(ROOT, "scores");
export const CACHE_DIR = resolve(ROOT, ".cache", "api");
export const PROMPT_PATH = resolve(ROOT, "scoring_prompt.txt");
export const INDEX_PATH = resolve(TRANSCRIPTS_DIR, "index.json");
export const RANKINGS_PATH = resolve(SCORES_DIR, "rankings.json");
export const PUBLIC_RANKINGS_PATH = resolve(ROOT, "public", "data", "rankings.json");
