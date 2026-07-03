# endslop

Rank conference talks by transcript quality. Fetches YouTube transcripts, scores them with Fireworks, and serves a rankings frontend.

Built with **TypeScript**, **Vite**, and deployable to **Vercel**.

Supported transcript providers:

- [TranscriptAPI](https://transcriptapi.com/) (`transcriptapi`, default when `TRANSCRIPTAPI_API_KEY` is set)
- [Supadata](https://supadata.ai/) (`supadata`)

## Setup

```bash
npm install
cp .env.example .env
# fill in API keys in .env
```

## Usage

```bash
# Fetch transcripts from a YouTube channel (default: past 2 months)
npm run fetch

# Score transcripts and write rankings (uses .cache/ to avoid repeat API calls)
npm run score

# Rebuild rankings from existing score files without calling APIs
npm run score -- --reparse

# Publish enriched rankings for the static site
npm run publish

# Full cache-first pipeline (retry transcripts + reparse + publish)
npm run pipeline -- --reparse-only

# Local dev server with live /api/rankings
npm run dev

# Production build
npm run build
```

The published site reads `public/data/rankings.json`. Local pipeline output (`transcripts/`, `scores/`, `.cache/`) stays gitignored.

## Deployment

**Live site:** https://endslop.xyz (Vercel)

Pushes to `main` on `pyrytakala/endslop` deploy automatically via Vercel Git integration (production branch: `main`). No separate deploy step is required — `git push origin main` is enough.

The optional `.github/workflows/pipeline.yml` workflow only refreshes `public/data/rankings.json` when API secrets are configured.

### GitHub secrets (optional pipeline refresh)

- `FIREWORKS_API_KEY`, `TRANSCRIPTAPI_API_KEY`, `SUPADATA_API_KEY` — for re-scoring on merge (uses `.cache/` when available)

## Project layout

```
src/           shared TS library + frontend entry
scripts/       CLI entrypoints (fetch, score, publish, pipeline)
public/data/   published rankings JSON for production
api/           optional Vercel serverless handlers
```
