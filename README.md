# Binder — landing page

Landing page for **Binder**: founder ↔ investor matchmaking. Swipe on fit,
double opt-in, auto-booked 20-minute coffee chats.

A static page plus one serverless function, deployed on Vercel. No build step
and no dependencies.

```
index.html            the whole page — markup, styles, demo screens, form logic
api/contact.js        POST /api/contact → emails the request via Resend
assets/video/         Figma prototype exports, re-encoded for the web (make media)
assets/og-image.png   1200×630 social card, rendered from build/og.html
build/ci.sh           the pipeline: syntax, tests, site checks
build/check-site.mjs  missing assets, external scripts, demo screens, weight budget
tests/                node:test suite for the contact route
vercel.json           security + cache headers
```

## Run it

```bash
make serve   # static preview on http://localhost:8000 (form returns an error: no API)
make dev     # full Vercel runtime incl. /api/contact — needs `npx vercel link` once
make ci      # what GitHub Actions runs on every push
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

## The demo screens

The phone in *How it works* is HTML, rebuilt from the Figma mock
(`Binder — App Mock`) at its native 393×852 and scaled with CSS, so it stays
sharp at any size and can switch between the founder and investor view. The
hero phone plays the two prototype video exports back to back.

Regenerate the videos after re-exporting from Figma:

```bash
make media SRC=..   # expects Binder_04_Discover_swipe.mp4 and Binder_06_Match.mp4 in SRC
make icons          # re-render og-image and PNG icons with headless Chrome
```
