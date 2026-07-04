# AI starred

Surface the top third of conference talks and podcast episodes by automated quality scoring. Built with **TypeScript**, **Vite**, and deployable to **Vercel**.

## Setup

```bash
npm install
cp .env.example .env
# fill in API keys in .env
```

## Usage

All pipeline commands accept `--source <id>` or `--all-sources`. Sources are defined in `src/lib/sources-config.ts`.

```bash
# Fetch transcripts for a source
npm run fetch -- --source latent-space-pod-q2-2026

# Score transcripts and write rankings (uses .cache/ to avoid repeat API calls)
npm run score -- --source ai-engineer-worlds-fair-2026

# Rebuild rankings from existing score files without calling APIs
npm run score -- --reparse --source ai-engineer-worlds-fair-2026

# Publish enriched rankings for the static site
npm run publish -- --all-sources

# Full cache-first pipeline for all sources (retry transcripts + reparse + publish)
npm run pipeline -- --reparse-only --all-sources

# Local dev server with per-source /api/rankings/:sourceId
npm run dev

# Production build
npm run build
```

The published site reads `public/data/<source-id>/rankings.json`. Local pipeline output (`transcripts/`, `scores/`, `.cache/`) stays gitignored.

## Deployment

**Live site:** https://aistarred.com (Vercel)

- `/` — feed (all ranked items, newest first)
- `/sources/` — browse by source
- `/sources/<slug>/` — individual source, sorted by score
- `/how-it-works/` — methodology
- `/disclaimer/` — disclaimer and contact

Legacy root-level source URLs (e.g. `/latent-space-pod-q2-2026/`) redirect to `/sources/<slug>/`.

Pushes to `main` deploy automatically via Vercel Git integration — `git push origin main` is enough.

**Publishing rankings (local, for now):**

```bash
npm run pipeline -- --reparse-only --all-sources   # or fetch/score/publish separately
git add public/data/
git commit -m "Update published rankings"
git push
```

API keys live in `.env` on your machine only (`FIREWORKS_API_KEY`, `TRANSCRIPTAPI_API_KEY`, `SUPADATA_API_KEY`). They are used to fetch transcripts and run LLM scoring locally. The static site only reads committed JSON under `public/data/` — no keys on Vercel.

The GitHub Actions workflow (`.github/workflows/pipeline.yml`) is **manual-only** (`workflow_dispatch`). It is not required for deploys.

## Project layout

```
src/           shared TS library + frontend entry
src/lib/sources-config.ts   source definitions (channel, date range, prompt, slug)
scripts/       CLI entrypoints (fetch, score, publish, pipeline)
public/data/   published rankings JSON per source
api/           optional Vercel serverless handlers
```
