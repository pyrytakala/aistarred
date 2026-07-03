# endslop

Surface the top third of conference talks and podcast episodes by automated quality scoring. Built with **TypeScript**, **Vite**, and deployable to **Vercel**.

## Setup

```bash
npm install
cp .env.example .env
# fill in API keys in .env
```

## Usage

All pipeline commands accept `--source <id>` or `--all-sources`. Sources are defined in `src/lib/sources.ts`.

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

**Live site:** https://endslop.xyz (Vercel)

- `/` — landing page
- `/how-it-works/` — methodology
- `/disclaimer/` — disclaimer and contact
- `/ai-engineer-worlds-fair-2026/` — AI Engineer World's Fair 2026 (live, 10-day window)
- `/latent-space-pod-q2-2026/` — Latent Space Pod, Q2 2026

Pushes to `main` on `pyrytakala/endslop` deploy automatically via Vercel Git integration (production branch: `main`). No separate deploy step is required — `git push origin main` is enough.

The optional `.github/workflows/pipeline.yml` workflow refreshes `public/data/*/rankings.json` when API secrets are configured.

### GitHub secrets (optional pipeline refresh)

- `FIREWORKS_API_KEY`, `TRANSCRIPTAPI_API_KEY`, `SUPADATA_API_KEY` — for re-scoring on merge (uses `.cache/` when available)

## Project layout

```
src/           shared TS library + frontend entry
src/lib/sources.ts   source definitions (channel, date range, prompt, slug)
scripts/       CLI entrypoints (fetch, score, publish, pipeline)
public/data/   published rankings JSON per source
api/           optional Vercel serverless handlers
```
