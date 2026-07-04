#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { applyContentLengthGate, formatMinimumContentLength } from "../src/lib/content-length.js";
import { sourcePaths } from "../src/lib/paths.js";
import { listSources } from "../src/lib/sources.js";
import { publishAllRankings } from "../src/pipeline/publish.js";
import type { IndexPayload } from "../src/lib/types.js";

let updatedEntries = 0;
let affectedSources = 0;

for (const source of listSources()) {
  const indexPath = sourcePaths(source.id).indexPath;
  if (!existsSync(indexPath)) {
    continue;
  }

  const payload = JSON.parse(readFileSync(indexPath, "utf8")) as IndexPayload;
  let sourceUpdated = 0;

  payload.videos = (payload.videos ?? []).map((video) => {
    const next = applyContentLengthGate(video, source.id);
    if (
      next.transcript_status !== video.transcript_status ||
      next.error !== video.error
    ) {
      sourceUpdated += 1;
      updatedEntries += 1;
    }
    return next;
  });

  if (sourceUpdated > 0) {
    writeFileSync(indexPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    affectedSources += 1;
    console.log(`${source.id}: marked ${sourceUpdated} item(s) below ${formatMinimumContentLength()}`);
  }
}

console.log(
  `\nUpdated ${updatedEntries} entries across ${affectedSources} source(s). Republishing rankings...`,
);

publishAllRankings({ reparse: true });
console.log("Done.");
