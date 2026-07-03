import { resolve } from "node:path";

export type { DateRange, SourceConfig } from "./sources-config.js";
export {
  DEFAULT_SOURCE_ID,
  SOURCES,
  getSource,
  listSources,
} from "./sources-config.js";

import type { SourceConfig } from "./sources-config.js";
import { DEFAULT_SOURCE_ID, listSources } from "./sources-config.js";

export function resolveSourceIdFromArgv(argv: string[]): string {
  const allSources = argv.includes("--all-sources");
  if (allSources) {
    return "";
  }
  const index = argv.indexOf("--source");
  if (index >= 0 && argv[index + 1]) {
    return argv[index + 1];
  }
  return DEFAULT_SOURCE_ID;
}

export function resolveSourceIdsFromArgv(argv: string[]): string[] {
  if (argv.includes("--all-sources")) {
    return listSources().map((source) => source.id);
  }
  const index = argv.indexOf("--source");
  if (index >= 0 && argv[index + 1]) {
    return [argv[index + 1]];
  }
  return listSources().map((source) => source.id);
}

export function promptPathForSource(source: SourceConfig): string {
  return resolve(process.cwd(), source.promptFile);
}
