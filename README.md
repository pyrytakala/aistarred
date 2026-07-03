# content-ranker

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

## Deployment (Vercel)

1. Create a Vercel project linked to this repo.
2. Add GitHub secrets for the deploy workflow:
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
   - Optional API keys for pipeline refresh: `FIREWORKS_API_KEY`, `TRANSCRIPTAPI_API_KEY`, `SUPADATA_API_KEY`
3. Push to `main` — GitHub Actions runs the cache-first pipeline, updates `public/data/rankings.json`, and deploys to Vercel.

## Project layout

```
src/           shared TS library + frontend entry
scripts/       CLI entrypoints (fetch, score, publish, pipeline)
public/data/   published rankings JSON for production
api/           optional Vercel serverless handlers
```
