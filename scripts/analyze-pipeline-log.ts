#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { formatDuration } from "../src/lib/stage-log.js";
import { pipelineLogPath } from "../src/lib/pipeline-log.js";

interface LogEntry {
  ts: string;
  category: string;
  event: string;
  durationMs?: number;
  sourceId?: string;
  [key: string]: unknown;
}

const logPath = process.argv[2] ?? pipelineLogPath();
const lines = readFileSync(logPath, "utf8")
  .trim()
  .split("\n")
  .filter(Boolean);

const entries: LogEntry[] = [];
for (const line of lines) {
  try {
    entries.push(JSON.parse(line) as LogEntry);
  } catch {
    // ignore malformed lines
  }
}

const timed = entries.filter((entry) => entry.durationMs != null);
timed.sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0));

console.log(`Analyzed ${entries.length} log entries from ${logPath}\n`);

console.log("Slowest events:");
for (const entry of timed.slice(0, 12)) {
  console.log(
    `  ${formatDuration(entry.durationMs ?? 0).padStart(8)}  ${entry.category}/${entry.event}  ${entry.sourceId ?? ""}`,
  );
}

const agg = new Map<string, { count: number; total: number; max: number }>();
for (const entry of timed) {
  const key = `${entry.category}/${entry.event}`;
  const bucket = agg.get(key) ?? { count: 0, total: 0, max: 0 };
  bucket.count += 1;
  bucket.total += entry.durationMs ?? 0;
  bucket.max = Math.max(bucket.max, entry.durationMs ?? 0);
  agg.set(key, bucket);
}

console.log("\nAverage duration (5+ samples):");
[...agg.entries()]
  .filter(([, stats]) => stats.count >= 5)
  .sort((a, b) => b[1].total / b[1].count - a[1].total / a[1].count)
  .slice(0, 12)
  .forEach(([key, stats]) => {
    console.log(
      `  ${formatDuration(stats.total / stats.count).padStart(8)} avg (max ${formatDuration(stats.max)}, n=${stats.count})  ${key}`,
    );
  });

const milestones = entries.filter((entry) => entry.event === "complete" || entry.event === "fetch-complete");
if (milestones.length) {
  console.log("\nRecent run milestones:");
  for (const entry of milestones.slice(-8)) {
    console.log(`  ${entry.ts}  ${entry.category}/${entry.event}  ${entry.sourceId ?? entry.message ?? ""}`);
  }
}
