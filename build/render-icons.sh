#!/usr/bin/env bash
# Renders the social card and PNG icons from build/og.html and build/icon.html.
# Chrome rather than ImageMagick because the card uses the site's web fonts.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME — set CHROME=/path/to/chrome"; exit 1; }
shot() { # html out w h
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --virtual-time-budget=6000 --window-size="$3,$4" --screenshot="$2" "file://$PWD/$1" 2>/dev/null
  [ -s "$2" ] || { echo "render failed: $2"; exit 1; }
  echo "  $2 ($3×$4)"
}
shot build/og.html   assets/og-image.png       1200 630
shot build/icon.html assets/apple-touch-icon.png 180 180
shot build/icon.html assets/favicon-32.png      32  32
