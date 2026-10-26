// Static checks for a site with no build step. Each one guards a failure that
// would otherwise only show up as a broken page in production:
//   - a renamed or missing asset (404 image, silent blank phone in the hero)
//   - a script loaded from a CDN we didn't intend to depend on
//   - the embedded prototype missing a file it needs to be driven or styled
//   - page weight creeping past the budget for a first visit on mobile
//   - SEO metadata drifting: a page missing from the sitemap, a duplicate
//     title, structured data that claims an FAQ answer the page doesn't show
// Whether the demo actually works in a browser is build/smoke.mjs's job.
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const problems = [];

// Public pages: every top-level .html except the 404. vercel.json's cleanUrls
// serves investor-list.html at /investor-list, so links use the clean form.
const SITE = 'https://binder.red';
const PAGES = readdirSync(root).filter((f) => f.endsWith('.html') && f !== '404.html').sort();
const urlFor = (f) => (f === 'index.html' ? `${SITE}/` : `${SITE}/${f.replace(/\.html$/, '')}`);
const resolveLocal = (ref) => {
  const clean = ref.replace(/\/$/, '') || '/';
  if (clean === '/') return 'index.html';
  const p = clean.slice(1);
  if (existsSync(join(root, p)) && statSync(join(root, p)).isFile()) return p;
  if (existsSync(join(root, p + '.html'))) return p + '.html';
  if (existsSync(join(root, p, 'index.html'))) return join(p, 'index.html');
  return null;
};

// 1. Every local reference on every page exists.
for (const f of [...PAGES, '404.html']) {
  const doc = readFileSync(join(root, f), 'utf8');
  for (const m of doc.matchAll(/\b(?:src|href|poster|content)="(\/[^"#?]*)/g)) {
    if (!resolveLocal(m[1])) problems.push(`${f} references ${m[1]}, which does not exist`);
  }
}

// 1b. The social card points at a real file on the production domain.
const og = html.match(/property="og:image" content="([^"]+)"/);
if (!og || !og[1].startsWith('https://binder.red/')) problems.push('og:image must be an absolute https://binder.red/ URL — link previews drop relative ones');
else if (!existsSync(join(root, og[1].replace('https://binder.red/', '')))) problems.push(`og:image ${og[1]} has no matching file in the repo`);

// 1c. No request to Google Fonts: it hands each visitor's IP to Google, which
//     the privacy policy says we don't do. The font is self-hosted.
for (const f of [...PAGES, '404.html', 'demo/index.html', 'assets/guide.css']) {
  if (/fonts\.(googleapis|gstatic)\.com/.test(readFileSync(join(root, f), 'utf8'))) problems.push(`${f} loads Google Fonts — use /assets/fonts (privacy policy promises no third parties)`);
}

// 2. No third-party scripts. Fonts come from Google Fonts as a stylesheet;
//    anything executable is inline so the page has no runtime dependency.
for (const m of html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)) {
  problems.push(`external script ${m[1]} — keep scripts inline`);
}

// 3. The prototype import is complete: boot.js drives it, embed.css frames
//    it, icons.js replaces the 600 KB Lucide bundle. Missing any of them, the
//    phones on the page show the wrong screen, a double frame, or no icons.
const demo = existsSync(join(root, 'demo/index.html')) ? readFileSync(join(root, 'demo/index.html'), 'utf8') : '';
if (!demo) problems.push('demo/index.html is missing — run node build/import-mock.mjs');
for (const f of ['boot.js', 'embed.css', 'icons.js']) {
  if (!existsSync(join(root, 'demo', f))) problems.push(`demo/${f} is missing`);
  // Absolute, because Vercel serves the page at /demo, where relative paths resolve to the root.
  if (demo && !demo.includes(`"/demo/${f}"`)) problems.push(`demo/index.html does not load /demo/${f} — rerun build/import-mock.mjs`);
}
if (demo.includes('lucide.js')) problems.push('demo/index.html still loads the full lucide.js bundle');
if (!/BINDER_STATE_VERSION=\d+/.test(demo)) problems.push('demo/index.html has no BINDER_STATE_VERSION — boot.js cannot drive it');
if (!/id="heroFrame" src="\/demo\?embed&amp;role=/.test(html)) problems.push('#heroFrame must load /demo?embed&role=…');
// The section phones must be locked, or "For investors" can be flipped to the founder app.
for (const id of ['founderFrame', 'investorFrame']) {
  if (!new RegExp(`id="${id}" src="/demo\\?embed&amp;lock&amp;role=`).test(html)) problems.push(`#${id} must load /demo?embed&lock&role=…`);
}

// Each walkthrough's steps need one entry each in STEPS[role], or scrolling
// past a step leaves the phone on the previous screen.
let stepCount = 0;
const table = html.match(/const STEPS = \{([\s\S]*?)\n\};/);
for (const m of html.matchAll(/<section class="sec how[^"]*" id="(\w+)" data-role="(\w+)">([\s\S]*?)<\/section>/g)) {
  const [, id, role, body] = m;
  const steps = (body.match(/class="step[^"]*" data-step=/g) || []).length;
  const dots = (body.match(/<button[^>]*aria-label="Step \d"/g) || []).length;
  const entries = table && table[1].match(new RegExp(`\\b${role}: \\[([\\s\\S]*?)\\]`));
  const n = entries ? (entries[1].match(/\{\s*page:/g) || []).length : 0;
  if (steps !== n) problems.push(`#${id}: ${steps} steps but ${n} entries in STEPS.${role}`);
  if (steps !== dots) problems.push(`#${id}: ${steps} steps but ${dots} dots`);
  stepCount += steps;
}
if (!stepCount) problems.push('no walkthrough sections found (section.how with data-role)');

// 4. Weight budget for everything a visitor can download.
const BUDGET = 1 * 1024 * 1024;
let total = PAGES.reduce((n, f) => n + statSync(join(root, f)).size, 0);
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : (total += statSync(p).size); });
walk(join(root, 'assets'));
if (existsSync(join(root, 'demo'))) walk(join(root, 'demo'));
if (total > BUDGET) problems.push(`page + assets + demo is ${(total / 1048576).toFixed(2)} MB, over the ${(BUDGET / 1048576).toFixed(1)} MB budget`);

// 6. Search and AI-answer metadata, per page. A page that is missing from the
//    sitemap, shares a title, or has a canonical pointing elsewhere quietly
//    loses ranking; FAQ structured data that doesn't match the visible FAQ is
//    against Google's guidelines and can get the page's rich results dropped.
const sitemap = existsSync(join(root, 'sitemap.xml')) ? readFileSync(join(root, 'sitemap.xml'), 'utf8') : '';
const inSitemap = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
const titles = new Map();
const strip = (t) => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
for (const f of PAGES) {
  const doc = readFileSync(join(root, f), 'utf8');
  const want = urlFor(f);
  const title = (doc.match(/<title>([^<]*)<\/title>/) || [])[1];
  const desc = (doc.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  const canon = (doc.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
  const h1s = (doc.match(/<h1[\s>]/g) || []).length;
  if (!title) problems.push(`${f}: no <title>`);
  else {
    if (strip(title).length > 65) problems.push(`${f}: title is ${strip(title).length} chars; Google truncates past ~60`);
    if (titles.has(title)) problems.push(`${f}: same <title> as ${titles.get(title)}`);
    titles.set(title, f);
  }
  if (!desc) problems.push(`${f}: no meta description`);
  else if (desc.length < 70 || desc.length > 170) problems.push(`${f}: meta description is ${desc.length} chars (aim for 120–160)`);
  if (canon !== want) problems.push(`${f}: canonical is ${canon}, expected ${want}`);
  if (h1s !== 1) problems.push(`${f}: ${h1s} <h1> elements, expected exactly 1`);
  if (!inSitemap.has(want)) problems.push(`${f}: ${want} is not in sitemap.xml`);
  const ld = doc.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  let graph = [];
  try { graph = ld ? JSON.parse(ld[1])['@graph'] || [] : []; } catch (e) { problems.push(`${f}: JSON-LD does not parse: ${e.message}`); }
  if (!ld) problems.push(`${f}: no JSON-LD structured data`);
  const faq = graph.find((n) => n['@type'] === 'FAQPage');
  const visible = [...doc.matchAll(/<details[^>]*><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map((m) => [strip(m[1]), strip(m[2])]);
  if (faq) {
    const claimed = faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]);
    if (JSON.stringify(claimed) !== JSON.stringify(visible)) problems.push(`${f}: FAQPage JSON-LD does not match the visible FAQ — regenerate it from the page`);
  } else if (visible.length) problems.push(`${f}: has a visible FAQ but no FAQPage JSON-LD`);
}
for (const loc of inSitemap) {
  const f = loc === `${SITE}/` ? 'index.html' : loc.replace(`${SITE}/`, '') + '.html';
  if (!PAGES.includes(f)) problems.push(`sitemap.xml lists ${loc}, which has no page`);
}
const robots = existsSync(join(root, 'robots.txt')) ? readFileSync(join(root, 'robots.txt'), 'utf8') : '';
if (!robots.includes(`Sitemap: ${SITE}/sitemap.xml`)) problems.push('robots.txt does not point to the sitemap');
if (/^Disallow:\s*\/\s*$/m.test(robots)) problems.push('robots.txt blocks the whole site for some crawler');
const llms = existsSync(join(root, 'llms.txt')) ? readFileSync(join(root, 'llms.txt'), 'utf8') : '';
if (!llms) problems.push('llms.txt is missing');
for (const m of llms.matchAll(/\]\((https:\/\/binder\.red[^)#]*)/g)) {
  if (!resolveLocal(m[1].replace(SITE, '') || '/')) problems.push(`llms.txt links to ${m[1]}, which does not exist`);
}

// 5. vercel.json parses.
try { JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')); } catch (e) { problems.push(`vercel.json: ${e.message}`); }

// 7. Legal pages carry [[PLACEHOLDERS]] until the company details exist.
//    Listed on every run; fatal with PUBLISH=1, which is set before publishing,
//    because a live privacy policy without a data controller is not compliant.
const placeholders = new Map();
for (const f of [...PAGES, '404.html']) {
  for (const m of readFileSync(join(root, f), 'utf8').matchAll(/\[\[([A-Z ()]+)\]\]/g)) placeholders.set(m[1], [...(placeholders.get(m[1]) || []), f]);
}
if (placeholders.size) {
  const list = [...placeholders].map(([k, fs]) => `${k} (${[...new Set(fs)].join(', ')})`).join('\n    ');
  if (process.env.PUBLISH === '1') problems.push(`legal placeholders still to fill:\n    ${list}`);
  else console.warn(`check-site: WARNING — ${placeholders.size} legal placeholder(s) to fill before publishing:\n    ${list}`);
}

if (problems.length) {
  console.error(`check-site: ${problems.length} problem(s)\n  - ` + problems.join('\n  - '));
  process.exit(1);
}
console.log(`check-site: ok — ${PAGES.length} pages, ${stepCount} steps, ${(total / 1024).toFixed(0)} KB total`);
