# content-ranker

Rank conference talks by transcript quality. Fetches YouTube transcripts, scores them with Fireworks, and serves a small rankings frontend.

Supported transcript providers:

- [TranscriptAPI](https://transcriptapi.com/) (`transcriptapi`, default when `TRANSCRIPTAPI_API_KEY` is set)
- [Supadata](https://supadata.ai/) (`supadata`)

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# fill in API keys in .env
```

## Usage

```bash
# Fetch transcripts from a YouTube channel (default: past 2 months)
python fetch_transcripts.py

# Use a specific provider
python fetch_transcripts.py --provider transcriptapi
python fetch_transcripts.py --provider supadata

# Score transcripts and write rankings
python score_transcripts.py

# Serve the rankings UI
python serve_frontend.py
```

The frontend reads `scores/rankings.json` and `transcripts/index.json`, which are generated locally and not committed.
