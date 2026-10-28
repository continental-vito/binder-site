# CLAUDE.md — binder-site

Landing page for Binder (founder ↔ investor matchmaking). Audience: founders,
investors, and YC / investors evaluating Binder itself. The page exists to show
how the app works and to collect demo and call requests.

## Shape

- Static `index.html` + one Vercel function `api/contact.js` + the imported
  prototype in `demo/`. No framework, no bundler, no npm dependencies — keep it
  that way unless a real need appears.
- `demo/index.html` and `demo/icons.js` are **generated** by
  `build/import-mock.mjs` from the mock export. Never hand-edit them; change
  `demo/boot.js` / `demo/embed.css`, or re-import.
- `build/smoke.mjs` drives both pages in headless Chrome and is part of
  `make ci`. A step on the page that no longer reaches its screen, or an icon
  missing from the subset, fails there and nowhere else.
- Public repo `continental-vito/binder-site`. GitHub Actions runs `build/ci.sh`
  on `main` and `dev` (ubuntu runner, free on a public repo). `make ci` runs the
  same script locally — run it before every push.
- Vercel: production = `main`, previews = every other branch.

## Rules specific to this page

- **No fabricated traction.** No logos, testimonials, user counts or quotes
  that are not real. The pilot numbers (20 investors / 100 founders / 30 days)
  are the plan from the Idea Lab decision memo and are labelled as such.
- Profiles and photos in the demo (Lumen Grid, Giulia Russo, Marco Bellini,
  Northlight) are illustrative — the portraits are AI-generated — and the page
  says so under the phone and on `/demo/`.
- The form must never claim success for a request that was not delivered.
- Statistics only from a primary or authoritative source, cited and linked on
  the page (the problem section cites Gompers et al. via NBER and DocSend).
  Never from SEO blogs that quote each other. Guide pages stay advice, not data. AI assistants quote these pages verbatim,
  so an invented number would be repeated as fact.
- Keep "Binder is a founder–investor matchmaking app…" worded the same in
  `llms.txt`, the index FAQ and the Organization JSON-LD — consistent entity
  descriptions are what AI answers latch onto.
- Legal pages: never publish with `[[PLACEHOLDERS]]` (`make publish-check`).
  Until the details exist they are listed in `.vercelignore` (not deployed),
  unlinked from every footer and the form, and out of the sitemap; check-site
  fails if a deployed page links to one. To publish: fill the placeholders,
  drop them from `.vercelignore`, restore the links and sitemap entries.
  They were drafted from how the site actually works (no cookies, no
  analytics, Vercel + Resend as processors) — if that changes, update
  privacy.html and cookies.html in the same commit. Drafts, not legal advice:
  the user should have an Italian lawyer review them.
- Only the hero phone is a free demo. The "For founders" / "For investors"
  phones stay locked to their side (`?lock`); smoke.mjs fails if one switches.
- Visual design follows the app mock: system font (Inter elsewhere), coral
  `#D95440`, accent background `#FFF1ED`, text `#1D1D1F` / `#515154`, the
  lowercase `binder.` wordmark.
- Page + assets + demo stay under the 1 MB budget the check enforces.

## Where things live

This repo: `~/Claude/Binder/4 - Operations/0.1 - Live product/binder-site`.
The export (`make export`): `~/Claude/Binder/4 - Operations/0 - website`.
The offline demo (`make demo-export`): `~/Claude/Binder/4 - Operations/0.2 - Live demo` —
refresh it after any demo change (re-import, logo, boot.js, embed.css).

## Source material (outside the repo, in `~/Claude/Binder/`)

- `3 - Marketing/1 - Mock/v2 - 25102026 Binder-Export-mock/` — **current** mock: 42 screenshots, SVGs, and the
  interactive prototype the site embeds (`LEGGIMI-FIGMA.md` describes it)
- `3 - Marketing/0 - Logo/Binder-Brand-Kit/` — **logo source of truth**: SVG
  masters, PNGs, favicons, `web/logo-home-link.html` (the header logo
  component the site uses). Never redraw or re-render the logo; take it from here.
- `3 - Marketing/1 - Mock/v1 - 24102026 /`, `_old/Figma mock.png` — the superseded v1 mock
- `0 - Admin/Binder_Decision_Memo.pdf` — internal memo (Italian); do not publish it
- Figma file key `u5rxsOYi5t6d8QW90QqIWl`, prototype start node `19:228`
