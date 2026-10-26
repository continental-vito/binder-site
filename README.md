# Binder — landing page

Landing page for **Binder**: founder ↔ investor matchmaking. Swipe on fit,
mutual interest only, 20-minute coffee chats booked on both calendars.

A static page plus one serverless function, deployed on Vercel. No build step
and no dependencies.

```
index.html            the whole page — markup, styles, step → screen table, form logic
demo/                 the interactive app prototype, imported from the mock export
  index.html            prototype as exported, plus the three files below
  boot.js               lets the page open it on a screen and drive it (hand-written)
  embed.css             frame-less layout when embedded; full-screen on phones (hand-written)
  icons.js              Lucide subset, generated — 10 KB instead of 600 KB
api/contact.js        POST /api/contact → emails the request via Resend
assets/og-image.png   1200×630 social card, rendered from build/og.html
build/import-mock.mjs pulls a new mock export into demo/
build/smoke.mjs       headless-Chrome test of every demo screen and landing step
build/check-site.mjs  missing files, external scripts, step table, weight budget
build/ci.sh           the pipeline: syntax, tests, site checks, smoke test
tests/                node:test suite for the contact route
vercel.json           security + cache headers
```

## Run it

```bash
make serve   # static preview on http://localhost:8000 (form returns an error: no API)
make dev     # full Vercel runtime incl. /api/contact — needs `npx vercel link` once
make ci      # what GitHub Actions runs on every push (needs Chrome for the smoke test)
make shots   # the smoke test, saving a screenshot of every screen to .shots/
make export  # browsable copy in ../website: clone + logos, articles, legal, screenshots, fonts
```

## Deploy on Vercel

Live at **https://binder.red** — Vercel project `binder-site` (team
`vitodelcambios-projects`), domain registered through Vercel.

- Production deploys from `main`; every push to `dev` gets a preview URL
  (behind Vercel login). Merge `dev` → `main` to publish.
- `www.binder.red` 308-redirects to `binder.red` (set on the project's domains).
- `binder-site-six.vercel.app` serves the same production deployment.
- `make live` runs the browser smoke test against the deployed site.

Routing comes from `vercel.json`: `cleanUrls` + `trailingSlash: false` serve
`demo/index.html` at `/demo`, so anything the demo loads must use an absolute
`/demo/...` path. The smoke test's local server emulates this.

### Environment variables

| Variable | Required | Value |
|---|---|---|
| `RESEND_API_KEY` | yes | resend.com → API Keys → Create (sending access) |
| `CONTACT_TO` | yes | inbox that receives requests; comma-separate several |
| `CONTACT_FROM` | no | e.g. `Binder <hello@yourdomain>` once the domain is verified in Resend |

Without `CONTACT_FROM`, mail is sent from Resend's shared `onboarding@resend.dev`
sender, which **only delivers to the address that owns the Resend account**.
Set `CONTACT_TO` to that address until a domain is verified.

Until the key and recipient are set, the route answers `503 not_configured`.
The page never shows "received" for a request that was not sent.

### Page configuration

At the top of the `<script>` in `index.html`:

| Setting | Effect |
|---|---|
| `BOOKING_URL` | Cal.com / Calendly / Google appointment link. When set, "Book a demo" opens it directly and a "Pick a time now" card appears. Empty → buttons scroll to the form. |
| `CONTACT_EMAIL` | Shown as a direct contact, and used to open a prefilled email if the form backend fails. Empty → hidden. |

## Search and AI answers (SEO / GEO)

| File | Purpose |
|---|---|
| `investor-list.html`, `meet-investors.html`, `capital-raise.html`, `founder-list.html` | One guide per search intent, served at `/investor-list` etc. |
| `sitemap.xml` | Every public page; `make ci` fails if a page is missing from it |
| `robots.txt` | Everything allowed except `/api/`; AI crawlers named explicitly; points to the sitemap |
| `llms.txt` | Plain-text summary of what Binder is, for AI assistants and their crawlers |
| `<key>.txt` + `make indexnow` | IndexNow: pushes the sitemap's URLs to Bing (which feeds ChatGPT search), Yandex and others |
| JSON-LD in each page | Organization, WebSite/Article, Breadcrumbs, FAQPage |
| `404.html` | Served by Vercel for unknown paths |
| `privacy.html`, `cookies.html`, `terms.html`, `legal.html` | GDPR privacy notice, cookie policy (no cookies), terms with financial-intermediary disclaimers, company legal notice |
| `assets/fonts/` | Self-hosted Inter (+ OFL licence). No request goes to Google Fonts — the privacy policy promises no third parties |

Every page's `FAQPage` structured data mirrors its visible FAQ exactly — `make ci`
fails if they drift, because answers the page doesn't show are against Google's
guidelines. Titles must be unique and under ~60 characters, descriptions
120–160, one `<h1>` per page, canonical = the page's own clean URL.

The legal pages contain `[[PLACEHOLDERS]]` for company details until they
exist. `make ci` lists them; `make publish-check` fails on them — run it
before merging to `main`.

After publishing changes to pages: `make indexnow`.

## The demo

Every phone on the page is the real prototype from the mock export
(`Binder-Export-mock-v2/prototype`), embedded at its native 390×844 and scaled.
Nothing a visitor does in it leaves the browser.

- **Hero** — the free demo: either side of the app, anywhere in it.
- **For founders / For investors** — one walkthrough per side. Each phone is
  opened with `?lock`, which pins it to its role: visitors can tap around that
  side of the app, but the Founder/Investor picker is a label, not a control.

 On touch screens the embedded phones are look-only, so the page still
scrolls under a thumb, and a button opens `/demo/` full screen instead.

The prototype was built as a ChatGPT widget: it restores its state from
`window.openai.widgetState` and re-renders on an `openai:set_globals` event.
`demo/boot.js` provides exactly that interface, which is how the page opens it
on a given screen (`/demo/?role=vc&page=booking`) and moves it as you scroll
through each walkthrough — without editing the prototype itself.

### Importing a new mock

```bash
make import MOCK=../Binder-Export-mock-v3   # rewrites demo/index.html and demo/icons.js
make shots                                  # check every screen in .shots/
make icons                                  # refresh the social card
```

If a step should land on a different screen, edit `STEPS.founder` or
`STEPS.vc` in `index.html`; `make ci` checks each table matches its steps.
The import stops with a reason if the export's shape has changed (script tag,
state version, Lucide layout) rather than writing a half-working demo.
