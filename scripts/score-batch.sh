#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p logs/scoring

SOURCES=(
  anthropic-engineering-h1-2026
  asterisk-issue-14-latest
  bens-bites-q2-2026
  construction-physics-q2-2026
  founders-podcast-q2-2026
  greg-isenberg-q2-2026
  gwern-blog-2025-2026
  hamel-dev-h1-2026
  how-i-built-this-q2-2026
  iltb-podcast-q2-2026
  import-ai-h1-2026
  lennys-podcast-q2-2026
  modern-wisdom-q2-2026
  my-first-million-q2-2026
  odd-lots-q2-2026
  openai-developer-blog-h1-2026
  peter-attia-q2-2026
  pmf-show-q2-2026
  pragmatic-engineer-2026
  simon-willison-h1-2026
  stratechery-h1-2026
  swyx-io-2026
  yc-startup-pod-q2-2026
)

MAX_PARALLEL="${MAX_PARALLEL:-5}"
WORKERS="${WORKERS:-8}"
MAX_WORKERS="${MAX_WORKERS:-12}"

for src in "${SOURCES[@]}"; do
  while [ "$(jobs -rp | wc -l | tr -d ' ')" -ge "$MAX_PARALLEL" ]; do
    sleep 5
  done

  (
    echo "=== START $src $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
    npm run score -- --source "$src" --workers "$WORKERS" --max-workers "$MAX_WORKERS" \
      && npm run publish -- --source "$src" --reparse
    echo "=== DONE $src exit=$? $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  ) > "logs/scoring/${src}.log" 2>&1 &
done

wait
echo "ALL SCORING COMPLETE $(date -u +%Y-%m-%dT%H:%M:%SZ)"
