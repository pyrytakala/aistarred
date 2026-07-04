#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { sourcePaths } from "../src/lib/paths.js";
import { writePreviewRankingsIfMissing } from "../src/lib/preview-rankings.js";
import { toPublicSource } from "../src/lib/public-source.js";
import { listSources } from "../src/lib/sources.js";
import { publishRankings } from "../src/pipeline/publish.js";
import type { RankingsPayload } from "../src/lib/types.js";
import { visibleScoredCount } from "../src/lib/visible-ranked.js";

const ROOT = resolve(import.meta.dirname, "..");
const MANIFEST_PATH = join(ROOT, "public", "data", "sources.json");
const VERCEL_PATH = join(ROOT, "vercel.json");

function rankedCountForSource(source: ReturnType<typeof listSources>[number]): number {
  const rankingsPath = sourcePaths(source.id).publicRankingsPath;
  if (!existsSync(rankingsPath)) {
    return 0;
  }

  const payload = JSON.parse(readFileSync(rankingsPath, "utf8")) as RankingsPayload;
  return visibleScoredCount(payload, {
    maxDisplayAgeDays: source.maxDisplayAgeDays,
    dateRange: source.dateRange,
  });
}

function syncSourcesManifest(): void {
  const manifest = {
    sources: listSources().map((source) => ({
      ...toPublicSource(source),
      rankedCount: rankedCountForSource(source),
    })),
  };

  mkdirSync(join(ROOT, "public", "data"), { recursive: true });
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Wrote ${MANIFEST_PATH} (${manifest.sources.length} sources)`);
}

function syncVercelRewrites(): void {
  const vercel = JSON.parse(readFileSync(VERCEL_PATH, "utf8")) as Record<string, unknown>;
  const rewrites = listSources().flatMap((source) => [
    { source: `/sources/${source.slug}`, destination: "/source/index.html" },
    { source: `/sources/${source.slug}/`, destination: "/source/index.html" },
  ]);
  const redirects = listSources().flatMap((source) => [
    { source: `/${source.slug}`, destination: `/sources/${source.slug}`, permanent: true },
    { source: `/${source.slug}/`, destination: `/sources/${source.slug}/`, permanent: true },
  ]);

  writeFileSync(
    VERCEL_PATH,
    `${JSON.stringify({ ...vercel, rewrites, redirects }, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `Updated ${VERCEL_PATH} (${rewrites.length} source rewrites, ${redirects.length} legacy redirects)`,
  );
}

function syncRankingsFiles(): void {
  let previewCount = 0;
  let publishedCount = 0;

  for (const source of listSources()) {
    const paths = sourcePaths(source.id);

    if (existsSync(paths.publicRankingsPath)) {
      continue;
    }

    if (existsSync(paths.rankingsPath)) {
      publishRankings({ sourceId: source.id });
      publishedCount += 1;
      continue;
    }

    if (writePreviewRankingsIfMissing(source.id)) {
      previewCount += 1;
    }
  }

  for (const source of listSources()) {
    if (!existsSync(sourcePaths(source.id).publicRankingsPath)) {
      writePreviewRankingsIfMissing(source.id);
      previewCount += 1;
    }
  }

  console.log(
    `Synced rankings: ${publishedCount} published from scores, ${previewCount} preview from transcripts`,
  );
}

syncSourcesManifest();
syncVercelRewrites();
syncRankingsFiles();
