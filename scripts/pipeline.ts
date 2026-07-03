#!/usr/bin/env node
import { publishRankings } from "../src/pipeline/publish.js";
import { runFetch } from "../src/pipeline/fetch.js";
import { runScore } from "../src/pipeline/score.js";

const argv = process.argv.slice(2);
const skipFetch = argv.includes("--skip-fetch");
const reparseOnly = argv.includes("--reparse-only");

if (reparseOnly) {
  publishRankings({ reparse: true });
  process.exit(0);
}

if (!skipFetch) {
  const fetchCode = await runFetch(["--retry-transcripts"]);
  if (fetchCode !== 0) {
    console.warn("Fetch step returned non-zero; continuing with cached transcripts.");
  }
}

const scoreCode = await runScore({ reparse: true, useCache: true });
if (scoreCode !== 0) {
  process.exit(scoreCode);
}

publishRankings({ reparse: true });
process.exit(0);
