// Static checks for a site with no build step. Each one guards a failure that
// would otherwise only show up as a broken page in production:
//   - a renamed or missing asset (404 image, silent blank phone in the hero)
//   - a script loaded from a CDN we didn't intend to depend on
//   - the founder/investor demo losing a screen for one side only
//   - media creeping past the weight budget for a first visit on mobile
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

// 3. Both sides of the demo have all five steps.
const screens = [...html.matchAll(/<div class="scr([^"]*)" data-screen="(\d)"/g)].map((m) => ({ cls: m[1], n: +m[2] }));
for (const side of ['f', 'i']) {
  const other = side === 'f' ? 'i-only' : 'f-only';
  const have = new Set(screens.filter((s) => !s.cls.includes(other)).map((s) => s.n));
  for (let n = 0; n < 5; n++) if (!have.has(n)) problems.push(`${side === 'f' ? 'founder' : 'investor'} view has no screen for step ${n + 1}`);
}
const stepCount = (html.match(/class="step[^"]*" data-step=/g) || []).length;
if (stepCount !== 5) problems.push(`expected 5 steps, found ${stepCount}`);

// 4. Weight budget for everything under assets/.
const BUDGET = 1.5 * 1024 * 1024;
let total = 0;
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : (total += statSync(p).size); });
walk(join(root, 'assets'));
if (total > BUDGET) problems.push(`assets/ is ${(total / 1048576).toFixed(2)} MB, over the ${(BUDGET / 1048576).toFixed(1)} MB budget — recompress media (make media)`);

// 5. vercel.json parses.
try { JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')); } catch (e) { problems.push(`vercel.json: ${e.message}`); }

if (problems.length) {
  console.error(`check-site: ${problems.length} problem(s)\n  - ` + problems.join('\n  - '));
  process.exit(1);
}
console.log(`check-site: ok — ${screens.length} screens, ${stepCount} steps, assets ${(total / 1024).toFixed(0)} KB`);
