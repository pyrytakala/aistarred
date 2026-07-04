#!/usr/bin/env node
import { publishAllRankings, publishRankings } from "../src/pipeline/publish.js";
import { resolveSourceIdsFromArgv } from "../src/lib/sources.js";

const argv = process.argv.slice(2);
const reparse = argv.includes("--reparse");
const sourceIds = resolveSourceIdsFromArgv(argv);

if (argv.includes("--all-sources")) {
  const payloads = publishAllRankings({ reparse });
  for (const payload of payloads) {
    console.log(
      `Published ${payload.ranked_count ?? 0} rankings for ${payload.source_id ?? "unknown"}`,
    );
  }
  process.exit(payloads.some((payload) => payload.ranked_count) ? 0 : 1);
}

for (const sourceId of sourceIds) {
  const payload = publishRankings({ reparse, sourceId });
  if (!payload) {
    console.log(`Skipped ${sourceId}: missing transcripts/index.json`);
    continue;
  }
  console.log(
    `Published ${payload.ranked_count ?? 0} rankings to public/data/${sourceId}/rankings.json`,
  );
}

process.exit(0);
