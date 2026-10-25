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
  if (demo && !demo.includes(`"${f}"`)) problems.push(`demo/index.html does not load ${f} — rerun build/import-mock.mjs`);
}
if (demo.includes('lucide.js')) problems.push('demo/index.html still loads the full lucide.js bundle');
if (!/BINDER_STATE_VERSION=\d+/.test(demo)) problems.push('demo/index.html has no BINDER_STATE_VERSION — boot.js cannot drive it');
for (const id of ['heroFrame', 'howFrame']) {
  if (!new RegExp(`id="${id}" src="/demo/\\?embed`).test(html)) problems.push(`#${id} must load /demo/?embed…`);
}

// Each step in the copy needs an entry in the STEPS table that drives the
// phone, or scrolling past it leaves the phone on the previous screen.
const stepCount = (html.match(/class="step[^"]*" data-step=/g) || []).length;
const stepsTable = html.match(/const STEPS = \[([\s\S]*?)\];/);
const tableCount = stepsTable ? (stepsTable[1].match(/\{\s*page:/g) || []).length : 0;
if (stepCount !== tableCount) problems.push(`${stepCount} steps in the copy but ${tableCount} entries in STEPS`);
if (stepCount !== (html.match(/<button[^>]*aria-label="Step \d"/g) || []).length) problems.push('step dots do not match the number of steps');

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
