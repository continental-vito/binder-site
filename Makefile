# One interface for every task. `make ci` is what GitHub Actions runs too.
SRC ?= ..

.PHONY: ci serve dev media icons

ci:
	@build/ci.sh

# Static preview on http://localhost:8000. The contact form needs `make dev`.
serve:
	python3 -m http.server 8000

# Full Vercel runtime locally, including /api/contact (needs `npx vercel link` once).
dev:
	npx vercel dev

# Re-encode the Figma prototype exports in $(SRC) for the web. The originals are
# ~10 Mbit/s screen captures; 640px H.264 at CRF 27 is visually identical in a
# 300px phone frame at 2x and about 30x smaller.
media:
	ffmpeg -loglevel error -y -i "$(SRC)/Binder_04_Discover_swipe.mp4" -an -vf "scale=640:-2,format=yuv420p" -c:v libx264 -preset slow -crf 27 -movflags +faststart assets/video/discover-swipe.mp4
	ffmpeg -loglevel error -y -i "$(SRC)/Binder_06_Match.mp4" -an -vf "scale=640:-2,format=yuv420p" -c:v libx264 -preset slow -crf 27 -movflags +faststart assets/video/match.mp4
	ffmpeg -loglevel error -y -ss 0.3 -i "$(SRC)/Binder_04_Discover_swipe.mp4" -frames:v 1 -vf scale=640:-2 -q:v 4 assets/video/discover-swipe-poster.jpg
	ffmpeg -loglevel error -y -ss 2.9 -i "$(SRC)/Binder_06_Match.mp4" -frames:v 1 -vf scale=640:-2 -q:v 4 assets/video/match-poster.jpg

# Render the social card and PNG icons from build/*.html with headless Chrome.
icons:
	build/render-icons.sh
