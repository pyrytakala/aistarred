#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { listSources } from "../src/lib/sources.js";

const logDir = join(process.cwd(), "logs", "scoring");
mkdirSync(logDir, { recursive: true });

const workers = process.argv.includes("--workers")
  ? process.argv[process.argv.indexOf("--workers") + 1] ?? "8"
  : "8";
const maxWorkers = process.argv.includes("--max-workers")
  ? process.argv[process.argv.indexOf("--max-workers") + 1] ?? "12"
  : "12";

const sources = listSources();
const failed: string[] = [];

for (const source of sources) {
  console.log(`\n========== SCORE ${source.id} ==========\n`);
  const score = spawnSync(
    "npm",
    ["run", "score", "--", "--source", source.id, "--workers", workers, "--max-workers", maxWorkers],
    { stdio: "inherit", cwd: process.cwd() },
  );
  if (score.status !== 0) {
    failed.push(source.id);
    continue;
  }

  const publish = spawnSync(
    "npm",
    ["run", "publish", "--", "--source", source.id, "--reparse"],
    { stdio: "inherit", cwd: process.cwd() },
  );
  if (publish.status !== 0) {
    failed.push(source.id);
  }
}

console.log(`\nScoring complete: ${sources.length - failed.length}/${sources.length} succeeded`);
if (failed.length) {
  console.log("Failed sources:");
  for (const id of failed) {
    console.log(`  - ${id}`);
  }
  process.exit(1);
}
