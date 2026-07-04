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

const SOURCE_SLUGS = new Set(listSources().map((source) => source.slug));

function isSourceListingPath(pathname: string): boolean {
  const match = pathname.match(/^\/([^/]+)\/?$/);
  return Boolean(match && SOURCE_SLUGS.has(match[1]));
}

function rewriteSourceListingRequest(req: IncomingMessage): void {
  const url = req.url ?? "/";
  const [pathname, search = ""] = url.split("?");
  if (isSourceListingPath(pathname)) {
    req.url = `/source/index.html${search ? `?${search}` : ""}`;
  }
}

function sourceListingRewritePlugin(): Plugin {
  const attachRewrites = (
    server: { middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } },
  ) => {
    server.middlewares.use((req, _res, next) => {
      rewriteSourceListingRequest(req);
      next();
    });
  };

  return {
    name: "source-listing-rewrite",
    configureServer: attachRewrites,
    configurePreviewServer: attachRewrites,
  };
}

function rankingsDevPlugin(): Plugin {
  return {
    name: "rankings-dev-api",
    configureServer(server) {
      server.middlewares.use(
        (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const sourcesMatch = req.url === "/api/sources";
          if (sourcesMatch) {
            const manifestPath = resolve(process.cwd(), "public", "data", "sources.json");
            if (!existsSync(manifestPath)) {
              res.statusCode = 404;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: "Missing public/data/sources.json. Run npm run sync-public-data." }));
              return;
            }
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(readFileSync(manifestPath, "utf8"));
            return;
          }

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

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [sourceListingRewritePlugin(), rankingsDevPlugin()],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: resolve(__dirname, "index.html"),
        "how-it-works": resolve(__dirname, "how-it-works/index.html"),
        disclaimer: resolve(__dirname, "disclaimer/index.html"),
        source: resolve(__dirname, "source/index.html"),
      },
    },
  },
});
