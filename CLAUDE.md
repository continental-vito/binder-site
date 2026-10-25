# CLAUDE.md — binder-site

Landing page for Binder (founder ↔ investor matchmaking). Audience: founders,
investors, and YC / investors evaluating Binder itself. The page exists to show
how the app works and to collect demo and call requests.

## Shape

- Static `index.html` + one Vercel function `api/contact.js`. No framework, no
  bundler, no npm dependencies — keep it that way unless a real need appears.
- Public repo `continental-vito/binder-site`. GitHub Actions runs `build/ci.sh`
  on `main` and `dev` (ubuntu runner, free on a public repo). `make ci` runs the
  same script locally — run it before every push.
- Vercel: production = `main`, previews = every other branch.

## Rules specific to this page

- **No fabricated traction.** No logos, testimonials, user counts or quotes
  that are not real. The pilot numbers (20 investors / 100 founders / 30 days)
  are the plan from the Idea Lab decision memo and are labelled as such.
- Profiles in the demo (Lumen Grid, Giulia Russo, Marco Bellini, Northlight)
  are illustrative and the page says so under the phone.
- The form must never claim success for a request that was not delivered.
- Every screen in the demo exists for both the founder and the investor view;
  `build/check-site.mjs` enforces it.
- `assets/` stays under the 1.5 MB budget the check enforces.

## Source material (outside the repo, in `~/Claude/Binder/`)

- `Figma mock.png` — overview of the 8 mock screens
- `Binder_04_Discover_swipe.mp4`, `Binder_06_Match.mp4` — prototype exports
- `Binder_Decision_Memo.pdf` — internal memo (Italian); do not publish it
- Figma file key `u5rxsOYi5t6d8QW90QqIWl`, prototype start node `19:228`
