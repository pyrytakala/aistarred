#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { listSources } from "../src/lib/sources.js";
import { runFetch } from "../src/pipeline/fetch.js";

const requestDelay = process.argv.includes("--request-delay")
  ? process.argv[process.argv.indexOf("--request-delay") + 1] ?? "0.3"
  : "0.3";

const logDir = join(process.cwd(), "logs", "fetch");
mkdirSync(logDir, { recursive: true });

const sources = listSources();
const summary: Array<{ id: string; code: number }> = [];

for (const source of sources) {
  const started = new Date().toISOString();
  console.log(`\n========== FETCH ${source.id} (${started}) ==========\n`);
  const logPath = join(logDir, `${source.id}.log`);
  const logLines: string[] = [`=== START ${source.id} ${started} ===`];

  const code = await runFetch(["--source", source.id, "--request-delay", requestDelay]);
  summary.push({ id: source.id, code });
  logLines.push(`=== DONE ${source.id} exit=${code} ${new Date().toISOString()} ===`);
  writeFileSync(logPath, `${logLines.join("\n")}\n`, "utf8");
}

const failed = summary.filter((entry) => entry.code !== 0);
console.log(`\nFetch complete: ${summary.length - failed.length}/${summary.length} succeeded`);
if (failed.length) {
  console.log("Failed sources:");
  for (const entry of failed) {
    console.log(`  - ${entry.id} (exit ${entry.code})`);
  }
}

process.exit(failed.length ? 1 : 0);
