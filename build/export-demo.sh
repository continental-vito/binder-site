#!/usr/bin/env bash
# Copies the live demo (demo/ as served at binder.red/demo) into a folder that
# opens straight from disk — double-click index.html, no server, no internet:
#
#   make demo-export DEST="../0.2 - Live demo"
#
# On the site the demo loads its files from absolute /demo/... paths (needed
# because Vercel serves it at /demo without a trailing slash). Opened from
# disk those resolve to the root of the drive, so this copy rewrites them to
# local paths and brings the logo file along. Each rewrite must match exactly,
# or the script stops instead of writing a demo that loads half its files.
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="${1:?usage: build/export-demo.sh <destination folder>}"
mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"
case "$DEST" in "$(pwd)"|"$(pwd)"/*) echo "export-demo: DEST must be outside the repo"; exit 1;; esac

rm -rf "${DEST:?}"/*
cp demo/icons.js demo/embed.css demo/LICENSE-lucide "$DEST/"
cp assets/brand/binder-wordmark-primary.svg "$DEST/"

python3 - "$DEST" <<'EOF'
import sys
dest = sys.argv[1]

def rewrite(src, out, pairs):
    s = open(src, encoding="utf-8").read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            sys.exit(f"export-demo: expected one {old!r} in {src}, found {n} — has the demo changed?")
        s = s.replace(old, new)
    open(f"{dest}/{out}", "w", encoding="utf-8").write(s)

rewrite("demo/index.html", "index.html", [
    ('href="/demo/embed.css"', 'href="embed.css"'),
    ('src="/demo/boot.js"', 'src="boot.js"'),
    ('src="/demo/icons.js"', 'src="icons.js"'),
])
# The bar above the phone links back to the site; offline, "/" would be the
# drive root, so it points at binder.red instead.
rewrite("demo/boot.js", "boot.js", [
    ('<a href="/" aria-label="Back to binder.red">', '<a href="https://binder.red" aria-label="Back to binder.red">'),
    ('/assets/brand/binder-wordmark-primary.svg', 'binder-wordmark-primary.svg'),
])
EOF

cat > "$DEST/README.md" <<'EOF'
# Binder — live demo

The interactive Binder app exactly as it runs on **https://binder.red/demo**,
with the brand-kit logo. It works offline: double-click `index.html`.

- Switch side with **Founder view / Investor view** at the top of the phone.
- Open directly on the investor side: add `?role=vc` to the address.
- Swipe the card (or tap Connect / Pass), open Matches, book a slot, edit the profile.
- Nothing you do is saved or sent anywhere; reloading starts fresh.
- Profiles, companies and photos are fictional; the portraits are AI-generated.

Generated from the website repo with `make demo-export` — don't edit these
files; change the site and re-export.

| File | |
|---|---|
| `index.html` | the app prototype (from the v2 mock), photos included |
| `boot.js`, `embed.css` | open it on any screen; phone-sized layout |
| `icons.js` | the icons it uses (Lucide, ISC licence in `LICENSE-lucide`) |
| `binder-wordmark-primary.svg` | logo for the bar above the phone |
EOF
echo "✓ demo exported to $DEST ($(ls "$DEST" | wc -l | tr -d ' ') files)"
