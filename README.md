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
```

## Deploy on Vercel

1. vercel.com → **Add New → Project** → import `continental-vito/binder-site`.
2. Framework preset **Other**, no build command, output directory `.` (the defaults).
3. Production branch: `main`. Every push to `dev` gets its own preview URL.
4. Add the environment variables below, then redeploy.

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

## The demo

Both phones on the page are the real prototype from the mock export
(`Binder-Export-mock-v2/prototype`), embedded at its native 390×844 and scaled.
Visitors can swipe, connect, book and edit a profile; nothing leaves the
browser. On touch screens the embedded phones are look-only, so the page still
scrolls under a thumb, and a button opens `/demo/` full screen instead.

The prototype was built as a ChatGPT widget: it restores its state from
`window.openai.widgetState` and re-renders on an `openai:set_globals` event.
`demo/boot.js` provides exactly that interface, which is how the page opens it
on a given screen (`/demo/?role=vc&page=booking`) and moves it as you scroll
through *How it works* — without editing the prototype itself.

### Importing a new mock

```bash
make import MOCK=../Binder-Export-mock-v3   # rewrites demo/index.html and demo/icons.js
make shots                                  # check every screen in .shots/
make icons                                  # refresh the social card
```

If a step should land on a different screen, edit `STEPS` in `index.html`.
The import stops with a reason if the export's shape has changed (script tag,
state version, Lucide layout) rather than writing a half-working demo.
