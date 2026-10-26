# One interface for every task. `make ci` is what GitHub Actions runs too.
MOCK ?=

.PHONY: ci serve dev import shots live indexnow publish-check export icons

ci:
	@build/ci.sh

# Static preview on http://localhost:8000. The contact form needs `make dev`.
serve:
	python3 -m http.server 8000

# Full Vercel runtime locally, including /api/contact (needs `npx vercel link` once).
dev:
	npx vercel dev

# Pull the interactive prototype from a mock export into demo/ (default: Binder/3 - Marketing/1 - Mock/v2 - 25102026 Binder-Export-mock).
import:
	node build/import-mock.mjs $(MOCK)

# Smoke test with screenshots of every demo screen and landing step, for review.
shots:
	node build/smoke.mjs --shots .shots

# The same browser test against the deployed site. Use LIVE=https://<preview> for a preview.
LIVE ?= https://binder.red
live:
	node build/smoke.mjs --base $(LIVE)

# Tell Bing (and through it ChatGPT search), Yandex and other IndexNow engines
# that pages changed. Run after a publish; the key file must already be live.
INDEXNOW_KEY := d13c8612c4cea135e2f53811185d83b9
indexnow:
	node build/indexnow.mjs $(INDEXNOW_KEY)

# Run before merging dev → main: like ci, but unfilled legal [[PLACEHOLDERS]] fail.
publish-check:
	PUBLISH=1 node build/check-site.mjs

# Browsable copy of the site outside the repo: clone + logos, articles, legal,
# screenshots, fonts. Re-run to refresh.
DEST ?= ../../0 - website
export:
	build/export.sh "$(DEST)"

# Render the social card and PNG icons from build/*.html with headless Chrome.
icons:
	build/render-icons.sh
