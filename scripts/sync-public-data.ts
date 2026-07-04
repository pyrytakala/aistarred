#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { listSources } from "../src/lib/sources.js";
import { toPublicSource } from "../src/lib/public-source.js";

const ROOT = resolve(import.meta.dirname, "..");
const MANIFEST_PATH = join(ROOT, "public", "data", "sources.json");
const VERCEL_PATH = join(ROOT, "vercel.json");

function syncSourcesManifest(): void {
  const manifest = {
    sources: listSources().map(toPublicSource),
  };

  mkdirSync(join(ROOT, "public", "data"), { recursive: true });
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Wrote ${MANIFEST_PATH} (${manifest.sources.length} sources)`);
}

function syncVercelRewrites(): void {
  const vercel = JSON.parse(readFileSync(VERCEL_PATH, "utf8")) as Record<string, unknown>;
  const rewrites = listSources().flatMap((source) => [
    { source: `/${source.slug}`, destination: "/source/index.html" },
    { source: `/${source.slug}/`, destination: "/source/index.html" },
  ]);

  writeFileSync(
    VERCEL_PATH,
    `${JSON.stringify({ ...vercel, rewrites }, null, 2)}\n`,
    "utf8",
  );
  console.log(`Updated ${VERCEL_PATH} (${rewrites.length} source rewrites)`);
}

syncSourcesManifest();
syncVercelRewrites();
