import { defineConfig, type Plugin } from "vite";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import { listSources } from "./src/lib/sources.js";

function rankingsPathForSource(sourceId: string): string | null {
  const candidates = [
    resolve(process.cwd(), "public", "data", sourceId, "rankings.json"),
    resolve(process.cwd(), "scores", sourceId, "rankings.json"),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
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

          const rankingsPath = rankingsPathForSource(match[1]);
          if (!rankingsPath) {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                error: `No rankings found for "${match[1]}". Run npm run publish.`,
              }),
            );
            return;
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(readFileSync(rankingsPath, "utf8"));
        },
      );
    },
  };
}

const pageEntries = Object.fromEntries(
  [
    ["home", resolve(__dirname, "index.html")],
    ["how-it-works", resolve(__dirname, "how-it-works/index.html")],
    ["disclaimer", resolve(__dirname, "disclaimer/index.html")],
    ...listSources().map((source) => [
      source.slug,
      resolve(__dirname, source.slug, "index.html"),
    ]),
  ],
);

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [rankingsDevPlugin()],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: pageEntries,
    },
  },
});
