import { pipelineLog } from "./pipeline-log.js";

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function stageLog(category: string, message: string, details: Record<string, unknown> = {}): void {
  const suffix =
    Object.keys(details).length > 0
      ? ` ${Object.entries(details)
          .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
          .join(" ")}`
      : "";
  console.log(`[${new Date().toISOString()}] [${category}] ${message}${suffix}`);
}

export function stageMilestone(
  category: string,
  event: string,
  message: string,
  details: Record<string, unknown> = {},
  durationMs?: number,
): void {
  stageLog(category, message, durationMs != null ? { ...details, duration: formatDuration(durationMs) } : details);
  pipelineLog(category, event, { message, ...details }, durationMs);
}

export class StageTimer {
  private readonly started = performance.now();

  constructor(
    private readonly category: string,
    private readonly label: string,
  ) {
    stageLog(category, `start ${label}`);
  }

  done(message?: string, details: Record<string, unknown> = {}): number {
    const durationMs = performance.now() - this.started;
    const summary = message ?? this.label;
    stageMilestone(this.category, "complete", `done ${summary}`, details, durationMs);
    return durationMs;
  }
}
