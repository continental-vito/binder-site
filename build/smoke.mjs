// Browser smoke test: loads the real pages in headless Chrome and drives them.
// It guards the failures a static check cannot see:
//   - an icon missing from the Lucide subset (renders as an empty gap, no error)
//   - a prototype screen that throws or renders empty for one role
//   - the landing page's steps no longer moving the embedded phone
//   - any uncaught exception or console error on either page
//
//   node build/smoke.mjs [--shots DIR]    CHROME=/path/to/chrome to override
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shotsArg = process.argv.indexOf('--shots');
const shots = shotsArg > 0 ? process.argv[shotsArg + 1] : null;

const CANDIDATES = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const chromePath = CANDIDATES.find((p) => existsSync(p));
if (!chromePath) { console.error('smoke: no Chrome found — set CHROME=/path/to/chrome'); process.exit(1); }

// Each walkthrough section and the screen each of its steps must put the phone
// on. Kept here, not imported from the page, so a change to either is caught.
const WALKTHROUGHS = [
  { id: 'founders', frame: 'founderFrame', role: 'founder', pages: ['financials', 'discover', 'match', 'conversation', 'booking'] },
  { id: 'investors', frame: 'investorFrame', role: 'vc', pages: ['financials', 'preferences', 'discover', 'match', 'booking'] },
];
const DEMO_PAGES = ['discover', 'match', 'conversation', 'connection', 'meeting-detail', 'booking', 'confirmed',
  'profile', 'edit', 'preferences', 'financials', 'visibility', 'calendar'];

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };
// Serve the way Vercel does with this vercel.json: cleanUrls + trailingSlash
// false means /demo/ redirects to /demo and /demo serves demo/index.html. A
// plain static server serves /demo/ directly, which hid a production bug:
// relative script paths in the demo resolved against / and 404'd.
const vercelCfg = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
if (vercelCfg.cleanUrls !== true || vercelCfg.trailingSlash !== false) {
  console.error('smoke: vercel.json routing changed (cleanUrls/trailingSlash) — update the emulation in smoke.mjs to match');
  process.exit(1);
}
const isFile = async (f) => { try { return (await stat(f)).isFile(); } catch { return false; } };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = normalize(decodeURIComponent(url.pathname));
  if (p.length > 1 && p.endsWith('/')) { res.writeHead(308, { Location: p.slice(0, -1) + url.search }); return res.end(); }
  let file = join(root, p);
  if (!extname(p)) {
    if (await isFile(file + '.html')) file += '.html';
    else if (await isFile(join(file, 'index.html'))) file = join(file, 'index.html');
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const port = 9400 + Math.floor(Math.random() * 400);
const profile = join(tmpdir(), `binder-smoke-${port}`);
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
let ws, seq = 0;
const pending = new Map();
const logs = [];

async function cleanup(code) {
  try { ws && ws.close(); } catch {}
  chrome.kill(); server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  process.exit(code);
}

try {
  let targets;
  for (let i = 0; i < 60 && !targets; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(250); }
  }
  if (!targets) throw new Error(`Chrome at ${chromePath} did not open its debugging port`);
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('cannot connect to Chrome')); });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) {
      logs.push(`console.${d.params.type}: ${d.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    }
    if (d.method === 'Runtime.exceptionThrown') logs.push(`exception: ${d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text}`);
  };
  const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(`eval failed: ${r.result.exceptionDetails.exception?.description || expression}`);
    return r.result.result.value;
  };
  const shot = async (name) => {
    if (!shots) return;
    await mkdir(shots, { recursive: true });
    const r = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(shots, name + '.png'), Buffer.from(r.result.data, 'base64'));
  };
  const open = async (url, w, h, dpr = 1) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 600 });
    await send('Page.navigate', { url });
    for (let i = 0; i < 40; i++) { await sleep(150); if (await evaluate('document.readyState') === 'complete') break; }
    await sleep(400);
  };
  const takeLogs = (where) => { while (logs.length) failures.push(`${where}: ${logs.shift()}`); };

  await send('Runtime.enable'); await send('Page.enable');

  // 1. Every prototype screen, both roles, renders with all its icons.
  await open(`${base}/demo?embed`, 390, 844, 2);
  if (!(await evaluate('typeof window.binderGo === "function"'))) failures.push('demo: boot.js did not load (window.binderGo missing)');
  if (!(await evaluate('typeof window.lucide === "object"'))) failures.push('demo: icons.js did not load (window.lucide missing)');
  if ((await evaluate(`getComputedStyle(document.getElementById('binder-color')).paddingTop`)) !== '0px') failures.push('demo: embed.css did not apply (prototype still has its own frame padding)');
  for (const role of ['founder', 'vc']) {
    for (const page of DEMO_PAGES) {
      await evaluate(`binderGo(${JSON.stringify({ role, page, index: 0, matchTab: 'new', activeContact: 'marco', activeMeeting: 'demo-1' })})`);
      await sleep(120);
      const r = await evaluate(`(() => { const root = document.getElementById('binder-color'); const main = root.querySelector('main');
        return { page: root.dataset.page, role: root.dataset.role, missing: [...document.querySelectorAll('[data-lucide]:not(svg)')].map(e => e.getAttribute('data-lucide')),
          text: main.innerText.trim().length }; })()`);
      const where = `demo ${role}/${page}`;
      if (r.page !== page || r.role !== role) failures.push(`${where}: prototype shows ${r.role}/${r.page}`);
      if (r.missing.length) failures.push(`${where}: icons missing from the subset: ${[...new Set(r.missing)].join(', ')} — rerun build/import-mock.mjs`);
      if (r.text < 20) failures.push(`${where}: screen rendered empty`);
      takeLogs(where);
      await shot(`demo-${role}-${page}`);
    }
  }

  // 2. Landing page: no errors, and each step puts the phone on its screen.
  for (const [w, h, label] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
    await open(`${base}/`, w, h);
    takeLogs(`landing ${label} load`);
    await shot(`landing-${label}-top`);
    // The hero phone is the visitor's first try: Connect must reach the match.
    if (label === 'desktop') {
      await evaluate(`document.getElementById('heroFrame').contentDocument.querySelector('[data-action=like]').click(), 1`);
      await sleep(1200);
      const after = await evaluate(`document.getElementById('heroFrame').contentDocument.getElementById('binder-color').dataset.page`);
      if (after !== 'match') failures.push(`landing hero: Connect in the live demo led to "${after}", expected "match"`);
    }
    for (const w of WALKTHROUGHS) {
      const frameJs = `document.getElementById('${w.frame}')`;
      // The section phones are lazy-loaded; bring each on screen as a visitor would.
      await evaluate(`document.documentElement.style.scrollBehavior='auto'; document.getElementById('${w.id}').scrollIntoView(); 1`);
      for (let i = 0; i < 40; i++) {
        await sleep(150);
        if (await evaluate(`!!(${frameJs}.contentWindow.binderGo && ${frameJs}.contentDocument.querySelector('#binder-color main').children.length)`)) break;
      }
      for (let i = 0; i < w.pages.length; i++) {
        await evaluate(`document.querySelectorAll('#${w.id} .dots button')[${i}].click()`);
        await sleep(900);
        const got = await evaluate(`(() => { const d = ${frameJs}.contentDocument.getElementById('binder-color'); return d && (d.dataset.role + '/' + d.dataset.page); })()`);
        if (got !== `${w.role}/${w.pages[i]}`) failures.push(`landing ${label} #${w.id}: step ${i + 1} shows ${got}, expected ${w.role}/${w.pages[i]}`);
        await shot(`landing-${label}-${w.id}-step${i + 1}`);
      }
      // A fast flick that overshoots — the last step's centre already above the
      // middle, its lower half still on screen — must still move the phone. The
      // first version watched a thin band at the centre: no step was in it, so
      // the phone stayed on step 1 beside step 5's text.
      if (label === 'desktop') {
        await evaluate(`document.querySelectorAll('#${w.id} .dots button')[0].click()`);
        await sleep(900);
        await evaluate(`(() => { const s = document.querySelectorAll('#${w.id} .step'); const last = s[s.length - 1].getBoundingClientRect();
          scrollTo(0, scrollY + last.top - 64 + last.height * 0.6); return 1; })()`);
        await sleep(900);
        const jumped = await evaluate(`${frameJs}.contentDocument.getElementById('binder-color').dataset.page`);
        const want = w.pages[w.pages.length - 1];
        if (jumped !== want) failures.push(`landing #${w.id}: after a jump to the last step the phone shows "${jumped}", expected "${want}"`);
      }
      // A locked phone must not switch sides, even if the picker is changed.
      const other = w.role === 'vc' ? 'founder' : 'vc';
      const after = await evaluate(`(() => { const d = ${frameJs}.contentDocument; const sel = d.querySelector('#binder-color header select');
        sel.value = '${other}'; sel.dispatchEvent(new Event('change', { bubbles: true })); return d.getElementById('binder-color').dataset.role; })()`);
      if (after !== w.role) failures.push(`landing ${label} #${w.id}: locked phone switched to ${after}`);
    }
    const overflow = await evaluate('document.documentElement.scrollWidth - innerWidth');
    if (overflow > 0) failures.push(`landing ${label}: page scrolls sideways by ${overflow}px`);
    takeLogs(`landing ${label}`);
  }
} catch (e) {
  failures.push(e.message);
}

if (failures.length) {
  console.error(`smoke: ${failures.length} problem(s)\n  - ` + failures.join('\n  - '));
  await cleanup(1);
}
console.log(`smoke: ok — ${DEMO_PAGES.length * 2} demo screens, ${WALKTHROUGHS.reduce((n, w) => n + w.pages.length, 0) * 2} landing steps${shots ? `, screenshots in ${shots}` : ''}`);
await cleanup(0);
