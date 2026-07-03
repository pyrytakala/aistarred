import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv(root = process.cwd()): void {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    const value = rest.join("=").trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function cacheEnabled(): boolean {
  const value = (process.env.API_CACHE ?? "1").trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(value);
}
