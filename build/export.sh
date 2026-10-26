#!/usr/bin/env bash
# Builds a browsable copy of the website outside the repo, for people who
# want the content rather than the code:
#
#   make export DEST=~/Claude/Binder/website
#
#   repo/         git clone from GitHub (main = what is live on binder.red)
#   logos/        "b." mark (SVG + PNG) and the "binder." wordmark (PNG)
#   social/       link-preview image
#   articles/     the four guides as Markdown
#   legal/        privacy, cookies, terms, legal notice as Markdown drafts
#   screenshots/  every app screen (retina) and every site page
#   fonts/        Inter + its licence
#
# Re-running refreshes everything. Content comes from this working copy;
# repo/ is pulled from GitHub. Nothing outside DEST is touched.
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="${1:?usage: build/export.sh <destination folder>}"
REPO_URL="https://github.com/continental-vito/binder-site.git"
mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"
case "$DEST" in "$(pwd)"|"$(pwd)"/*) echo "export: DEST must be outside the repo"; exit 1;; esac

echo "▸ repo/"
if [ -d "$DEST/repo/.git" ]; then
  git -C "$DEST/repo" pull --ff-only --quiet
else
  git clone --quiet "$REPO_URL" "$DEST/repo"
fi
echo "  $(git -C "$DEST/repo" log --oneline -1)"

# Generated folders are rebuilt from scratch so removed files don't linger.
for d in logos social articles legal screenshots fonts; do rm -rf "${DEST:?}/$d"; mkdir -p "$DEST/$d"; done

echo "▸ logos/"
node build/export-logos.mjs "$DEST/logos" | sed 's/^/ /'

echo "▸ social/"
cp assets/og-image.png "$DEST/social/link-preview-1200x630.png"
cp assets/apple-touch-icon.png "$DEST/social/app-icon-180.png"

echo "▸ articles/ and legal/"
for f in investor-list meet-investors capital-raise founder-list; do
  python3 build/html2md.py "$f.html" > "$DEST/articles/$f.md"
done
for f in privacy cookies terms legal; do
  python3 build/html2md.py "$f.html" > "$DEST/legal/$f.md"
done
ls "$DEST/articles" "$DEST/legal" | sed 's/^/  /'

echo "▸ fonts/"
cp assets/fonts/* "$DEST/fonts/"

echo "▸ screenshots/ (browser run, ~1 min)"
SHOTS="$(mktemp -d)"
node build/smoke.mjs --shots "$SHOTS" > /dev/null
mkdir -p "$DEST/screenshots/app-founder" "$DEST/screenshots/app-investor" "$DEST/screenshots/site"
for f in "$SHOTS"/demo-founder-*.png; do cp "$f" "$DEST/screenshots/app-founder/$(basename "$f" | sed 's/^demo-founder-//')"; done
for f in "$SHOTS"/demo-vc-*.png;      do cp "$f" "$DEST/screenshots/app-investor/$(basename "$f" | sed 's/^demo-vc-//')"; done
for f in "$SHOTS"/landing-*.png "$SHOTS"/guide-*.png; do cp "$f" "$DEST/screenshots/site/"; done
rm -rf "$SHOTS"
echo "  $(ls "$DEST/screenshots/app-founder" | wc -l | tr -d ' ') founder screens, $(ls "$DEST/screenshots/app-investor" | wc -l | tr -d ' ') investor screens, $(ls "$DEST/screenshots/site" | wc -l | tr -d ' ') site pages"

cp build/export-README.md "$DEST/README.md"
echo "✓ exported to $DEST"
