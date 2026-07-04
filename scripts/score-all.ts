#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { listSources } from "../src/lib/sources.js";
import { StageTimer, stageLog } from "../src/lib/stage-log.js";

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
const batchTimer = new StageTimer("score-all", `${sources.length} sources`);

for (const source of sources) {
  const sourceTimer = new StageTimer("score-all", source.id);
  const score = spawnSync(
    "npm",
    ["run", "score", "--", "--source", source.id, "--workers", workers, "--max-workers", maxWorkers],
    { stdio: "inherit", cwd: process.cwd() },
  );
  if (score.status !== 0) {
    failed.push(source.id);
    sourceTimer.done(source.id, { exit: score.status ?? 1, stage: "score" });
    continue;
  }

  const publish = spawnSync(
    "npm",
    ["run", "publish", "--", "--source", source.id, "--reparse"],
    { stdio: "inherit", cwd: process.cwd() },
  );
  if (publish.status !== 0) {
    failed.push(source.id);
    sourceTimer.done(source.id, { exit: publish.status ?? 1, stage: "publish" });
    continue;
  }

  sourceTimer.done(source.id, { exit: 0 });
}

batchTimer.done("score-all", {
  succeeded: sources.length - failed.length,
  failed: failed.length,
});

if (failed.length) {
  stageLog("score-all", "failed sources", { sources: failed });
  process.exit(1);
}
