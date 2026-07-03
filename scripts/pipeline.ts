#!/usr/bin/env node
import { publishAllRankings, publishRankings } from "../src/pipeline/publish.js";
import { runFetch } from "../src/pipeline/fetch.js";
import { runScore } from "../src/pipeline/score.js";
import { getSource, resolveSourceIdsFromArgv } from "../src/lib/sources.js";

const argv = process.argv.slice(2);
const skipFetch = argv.includes("--skip-fetch");
const reparseOnly = argv.includes("--reparse-only");
const sourceIds = resolveSourceIdsFromArgv(argv);

async function runSourcePipeline(sourceId: string): Promise<number> {
  const source = getSource(sourceId);
  console.log(`\n=== ${source.title} ===\n`);

  if (reparseOnly) {
    publishRankings({ reparse: true, sourceId });
    return 0;
  }

  if (!skipFetch) {
    const fetchCode = await runFetch(["--source", sourceId, "--retry-transcripts"]);
    if (fetchCode !== 0) {
      console.warn(`Fetch step for ${sourceId} returned non-zero; continuing with cached transcripts.`);
    }
  }

  const scoreCode = await runScore({ sourceId, reparse: true, useCache: true });
  if (scoreCode !== 0) {
    return scoreCode;
  }

  publishRankings({ reparse: true, sourceId });
  return 0;
}

if (reparseOnly && argv.includes("--all-sources")) {
  publishAllRankings({ reparse: true });
  process.exit(0);
}

let exitCode = 0;
for (const sourceId of sourceIds) {
  const code = await runSourcePipeline(sourceId);
  if (code !== 0) {
    exitCode = code;
  }
}

process.exit(exitCode);
