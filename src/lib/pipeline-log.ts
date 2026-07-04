import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const LOG_DIR = join(process.cwd(), "logs");
const LOG_FILE = join(process.cwd(), "logs", "pipeline.log");

export interface PipelineLogEntry {
  ts: string;
  category: string;
  event: string;
  durationMs?: number;
  [key: string]: unknown;
}

function writeLog(entry: PipelineLogEntry): void {
  mkdirSync(LOG_DIR, { recursive: true });
  appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}

export function pipelineLog(
  category: string,
  event: string,
  details: Record<string, unknown> = {},
  durationMs?: number,
): void {
  writeLog({
    ts: new Date().toISOString(),
    category,
    event,
    ...(durationMs != null ? { durationMs: Math.round(durationMs) } : {}),
    ...details,
  });
}

export async function withPipelineTiming<T>(
  category: string,
  event: string,
  details: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    pipelineLog(category, event, { ...details, status: "ok" }, performance.now() - start);
    return result;
  } catch (error) {
    pipelineLog(
      category,
      event,
      { ...details, status: "error", error: error instanceof Error ? error.message : String(error) },
      performance.now() - start,
    );
    throw error;
  }
}

export function pipelineLogSync<T>(
  category: string,
  event: string,
  details: Record<string, unknown>,
  fn: () => T,
): T {
  const start = performance.now();
  try {
    const result = fn();
    pipelineLog(category, event, { ...details, status: "ok" }, performance.now() - start);
    return result;
  } catch (error) {
    pipelineLog(
      category,
      event,
      { ...details, status: "error", error: error instanceof Error ? error.message : String(error) },
      performance.now() - start,
    );
    throw error;
  }
}

export function pipelineLogPath(): string {
  return LOG_FILE;
}
