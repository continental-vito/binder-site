// Static checks for a site with no build step. Each one guards a failure that
// would otherwise only show up as a broken page in production:
//   - a renamed or missing asset (404 image, silent blank phone in the hero)
//   - a script loaded from a CDN we didn't intend to depend on
//   - the embedded prototype missing a file it needs to be driven or styled
//   - page weight creeping past the budget for a first visit on mobile
// Whether the demo actually works in a browser is build/smoke.mjs's job.
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const problems = [];

// 1. Every local reference exists.
for (const m of html.matchAll(/\b(?:src|href|poster|content)="(\/[^"#?]*)"/g)) {
  const ref = m[1];
  if (ref === '/') continue;
  if (!existsSync(join(root, ref))) problems.push(`index.html references ${ref}, which does not exist`);
}

// 1b. The social card points at a real file on the production domain.
const og = html.match(/property="og:image" content="([^"]+)"/);
if (!og || !og[1].startsWith('https://binder.red/')) problems.push('og:image must be an absolute https://binder.red/ URL — link previews drop relative ones');
else if (!existsSync(join(root, og[1].replace('https://binder.red/', '')))) problems.push(`og:image ${og[1]} has no matching file in the repo`);

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
let total = statSync(join(root, 'index.html')).size;
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : (total += statSync(p).size); });
walk(join(root, 'assets'));
if (existsSync(join(root, 'demo'))) walk(join(root, 'demo'));
if (total > BUDGET) problems.push(`page + assets + demo is ${(total / 1048576).toFixed(2)} MB, over the ${(BUDGET / 1048576).toFixed(1)} MB budget`);

// 5. vercel.json parses.
try { JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')); } catch (e) { problems.push(`vercel.json: ${e.message}`); }

if (problems.length) {
  console.error(`check-site: ${problems.length} problem(s)\n  - ` + problems.join('\n  - '));
  process.exit(1);
}
console.log(`check-site: ok — ${stepCount} steps, ${(total / 1024).toFixed(0)} KB total`);
