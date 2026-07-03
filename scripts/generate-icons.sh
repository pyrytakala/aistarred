#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/public/brand/logo-source.png"
OUT="$ROOT/public/icons"
CLEAN="$(mktemp -t aistarred-logo-clean).png"

if [[ ! -f "$SRC" ]]; then
  echo "Missing $SRC"
  exit 1
fi

mkdir -p "$OUT"

WIDTH="$(magick identify -format "%w" "$SRC")"
HEIGHT="$(magick identify -format "%h" "$SRC")"

# Remove the white matte by flooding from the image corners only (keeps teeth/highlights).
magick "$SRC" -alpha set -channel rgba -fuzz 12% -fill none \
  -draw "color 0,0 floodfill" \
  -draw "color $((WIDTH - 1)),0 floodfill" \
  -draw "color 0,$((HEIGHT - 1)) floodfill" \
  -draw "color $((WIDTH - 1)),$((HEIGHT - 1)) floodfill" \
  "$CLEAN"

for size in 16 32 48 180; do
  magick "$CLEAN" -resize "${size}x${size}" -background none -gravity center -extent "${size}x${size}" -strip "$OUT/favicon-${size}.png"
done

magick "$CLEAN" -resize 28x28 -background none -gravity center -extent 28x28 -strip "$OUT/logo-28.png"
magick "$CLEAN" -resize 72x72 -background none -gravity center -extent 72x72 -strip "$OUT/logo-72.png"
cp "$OUT/favicon-180.png" "$OUT/apple-touch-icon.png"

rm -f "$CLEAN"

echo "Generated transparent icons in public/icons/"
