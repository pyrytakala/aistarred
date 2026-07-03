import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { cacheEnabled } from "./env.js";
import { CACHE_DIR } from "./paths.js";

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function stableJson(value: unknown): string {
  // Match Python json.dumps(..., sort_keys=True) default separators (", ", ": ")
  return JSON.stringify(sortDeep(value))
    .replaceAll('","', '", "')
    .replaceAll('":"', '": "');
}

export class ApiCache {
  readonly cacheDir: string;

  constructor(
    readonly namespace: string,
    cacheDir = CACHE_DIR,
  ) {
    this.cacheDir = join(cacheDir, namespace);
    mkdirSync(this.cacheDir, { recursive: true });
  }

  makeKey(
    method: string,
    url: string,
    params?: Record<string, unknown> | null,
    body?: Record<string, unknown> | null,
  ): string {
    const parts = [this.namespace, method.toUpperCase(), url];
    if (params) {
      parts.push(stableJson(params));
    }
    if (body) {
      parts.push(stableJson(body));
    }
    return parts.join("|");
  }

  private pathForKey(key: string): string {
    const digest = createHash("sha256").update(key).digest("hex");
    return join(this.cacheDir, `${digest}.json`);
  }

  get(key: string): unknown | null {
    const path = this.pathForKey(key);
    if (!existsSync(path)) {
      return null;
    }
    try {
      const payload = JSON.parse(readFileSync(path, "utf8")) as { key?: string; data?: unknown };
      if (payload.key !== key) {
        return null;
      }
      return payload.data ?? null;
    } catch {
      return null;
    }
  }

  set(key: string, data: unknown): void {
    const path = this.pathForKey(key);
    writeFileSync(path, `${JSON.stringify({ key, data })}\n`, "utf8");
  }
}

export async function fetchCachedJson<T extends Record<string, unknown>>(
  cache: ApiCache,
  options: {
    method: string;
    url: string;
    params?: Record<string, unknown> | null;
    body?: Record<string, unknown> | null;
    fetcher: () => Promise<T>;
    enabled?: boolean;
  },
): Promise<[T, boolean]> {
  const useCache = options.enabled ?? cacheEnabled();
  const key = cache.makeKey(options.method, options.url, options.params, options.body);

  if (useCache) {
    const cached = cache.get(key);
    if (cached !== null && typeof cached === "object") {
      return [cached as T, true];
    }
  }

  const payload = await options.fetcher();
  if (useCache) {
    cache.set(key, payload);
  }
  return [payload, false];
}

export async function fetchCachedText(
  cache: ApiCache,
  options: {
    key: string;
    fetcher: () => Promise<string>;
    enabled?: boolean;
  },
): Promise<[string, boolean]> {
  const useCache = options.enabled ?? cacheEnabled();

  if (useCache) {
    const cached = cache.get(options.key);
    if (typeof cached === "string") {
      return [cached, true];
    }
  }

  const payload = await options.fetcher();
  if (useCache) {
    cache.set(options.key, payload);
  }
  return [payload, false];
}

export function fireworksCacheKey(model: string, prompt: string): string {
  const digest = createHash("sha256").update(`${model}\n${prompt}`).digest("hex");
  return `fireworks|${model}|${digest}`;
}
