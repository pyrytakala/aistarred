#!/usr/bin/env node
import { publishRankings } from "../src/pipeline/publish.js";

const reparse = process.argv.includes("--reparse");
const payload = publishRankings({ reparse });
console.log(`Published ${payload.ranked_count ?? 0} rankings to public/data/rankings.json`);
process.exit(payload.ranked_count ? 0 : 1);
