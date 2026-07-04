#!/usr/bin/env node
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";

import { listSources } from "../src/lib/sources.js";
import { StageTimer, stageLog } from "../src/lib/stage-log.js";
import { runFetch } from "../src/pipeline/fetch.js";

const requestDelay = process.argv.includes("--request-delay")
  ? process.argv[process.argv.indexOf("--request-delay") + 1] ?? "0.3"
  : "0.3";

const fromSource = process.argv.includes("--from")
  ? process.argv[process.argv.indexOf("--from") + 1]
  : null;

const skipSources = new Set(
  process.argv.includes("--skip")
    ? process.argv.slice(process.argv.indexOf("--skip") + 1).filter((arg) => !arg.startsWith("--"))
    : ["paul-graham-essays-2020s"],
);

const logDir = join(process.cwd(), "logs", "fetch");
mkdirSync(logDir, { recursive: true });

let sources = listSources().filter((source) => !skipSources.has(source.id));
if (fromSource) {
  const startIndex = sources.findIndex((source) => source.id === fromSource);
  if (startIndex < 0) {
    console.error(`Unknown --from source "${fromSource}"`);
    process.exit(1);
  }
  sources = sources.slice(startIndex);
}

const batchTimer = new StageTimer("fetch-all", `${sources.length} sources`);
const summary: Array<{ id: string; code: number }> = [];

for (const source of sources) {
  const sourceTimer = new StageTimer("fetch-all", source.id);
  const logPath = join(logDir, `${source.id}.log`);
  const logStream = createWriteStream(logPath, { flags: "w" });
  const writeLog = (chunk: string) => {
    logStream.write(chunk);
  };

  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    const line = `${args.map(String).join(" ")}\n`;
    writeLog(line);
    originalLog(...args);
  };
  console.error = (...args: unknown[]) => {
    const line = `${args.map(String).join(" ")}\n`;
    writeLog(line);
    originalError(...args);
  };

  let code = 1;
  try {
    code = await runFetch(["--source", source.id, "--request-delay", requestDelay]);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    logStream.end();
  }

  summary.push({ id: source.id, code });
  sourceTimer.done(source.id, { exit: code, logPath });
}

const failed = summary.filter((entry) => entry.code !== 0);
batchTimer.done("fetch-all", {
  succeeded: summary.length - failed.length,
  failed: failed.length,
});

if (failed.length) {
  stageLog("fetch-all", "failed sources", { sources: failed.map((entry) => entry.id) });
  process.exit(1);
}
