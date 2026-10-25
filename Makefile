# One interface for every task. `make ci` is what GitHub Actions runs too.
MOCK ?=

.PHONY: ci serve dev import shots live icons

ci:
	@build/ci.sh

# Static preview on http://localhost:8000. The contact form needs `make dev`.
serve:
	python3 -m http.server 8000

# Full Vercel runtime locally, including /api/contact (needs `npx vercel link` once).
dev:
	npx vercel dev

# Pull the interactive prototype from a mock export into demo/ (default ../Binder-Export-mock-v2).
import:
	node build/import-mock.mjs $(MOCK)

# Smoke test with screenshots of every demo screen and landing step, for review.
shots:
	node build/smoke.mjs --shots .shots

# The same browser test against the deployed site. Use LIVE=https://<preview> for a preview.
LIVE ?= https://binder.red
live:
	node build/smoke.mjs --base $(LIVE)

# Render the social card and PNG icons from build/*.html with headless Chrome.
icons:
	build/render-icons.sh
