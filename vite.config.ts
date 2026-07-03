import { defineConfig, type Plugin } from "vite";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import { buildRankingsFromScoreFiles, finalizeRankings, sanitizePublishedPayload } from "./src/pipeline/publish.js";
import { sourcePaths } from "./src/lib/paths.js";
import { getSource, listSources, promptPathForSource } from "./src/lib/sources.js";
import type { RankingsPayload } from "./src/lib/types.js";

function loadDevRankings(sourceId: string): RankingsPayload {
  const source = getSource(sourceId);
  const paths = sourcePaths(sourceId);
  const promptPath = promptPathForSource(source);

  if (existsSync(paths.rankingsPath)) {
    const raw = JSON.parse(readFileSync(paths.rankingsPath, "utf8")) as RankingsPayload;
    return sanitizePublishedPayload(
      finalizeRankings(raw.rankings ?? [], {
        model: raw.model,
        promptPath: raw.prompt_path ?? promptPath,
        indexPath: paths.indexPath,
        source,
      }),
      source,
    );
  }

  const results = buildRankingsFromScoreFiles(paths.indexPath, paths.scoresDir);
  return sanitizePublishedPayload(
    finalizeRankings(results, {
      promptPath,
      indexPath: paths.indexPath,
      source,
    }),
    source,
  );
}

function rankingsDevPlugin(): Plugin {
  return {
    name: "rankings-dev-api",
    configureServer(server) {
      server.middlewares.use(
        (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const match = req.url?.match(/^\/api\/rankings\/([^/?]+)/);
          if (!match) {
            next();
            return;
          }

          try {
            const payload = loadDevRankings(match[1]);
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify(payload));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        },
      );
    },
  };
}

const pageEntries = Object.fromEntries(
  [
    ["home", resolve(__dirname, "index.html")],
    ["how-it-works", resolve(__dirname, "how-it-works/index.html")],
    ...listSources().map((source) => [
      source.slug,
      resolve(__dirname, source.slug, "index.html"),
    ]),
  ],
);

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [rankingsDevPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: pageEntries,
    },
  },
});
