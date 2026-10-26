// Renders the logo files for the export: the "b." mark at several sizes and
// the "binder." wordmark as transparent PNGs.
//
//   node build/export-logos.mjs <out-dir>
//
// The wordmark exists on the site only as styled text (system font, 700,
// tight tracking), so there is no source file to copy. Chrome renders it the
// same way the site does on a Mac, cropped tight to the glyphs, with a
// transparent background so it can go on slides and documents.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2];
if (!out) { console.error('usage: export-logos.mjs <out-dir>'); process.exit(1); }
mkdirSync(out, { recursive: true });

const CHROME = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].filter(Boolean).find((p) => existsSync(p));
if (!CHROME) { console.error('export-logos: Chrome not found — set CHROME=/path/to/chrome'); process.exit(1); }

const port = 9700 + Math.floor(Math.random() * 200);
const profile = join(tmpdir(), `binder-logos-${port}`);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 60 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(250); } }
if (!targets) { console.error('export-logos: Chrome did not start'); process.exit(1); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let seq = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Page.enable');
await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });

async function render(html, file, { scale = 1, pad = 0 } = {}) {
  await send('Emulation.setDeviceMetricsOverride', { width: 2400, height: 1200, deviceScaleFactor: scale, mobile: false });
  await send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) });
  await sleep(600);
  const r = await send('Runtime.evaluate', { expression: `(() => { const b = document.getElementById('x').getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; })()`, returnByValue: true });
  const [x, y, w, h] = r.result.result.value;
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: x - pad, y: y - pad, width: w + 2 * pad, height: h + 2 * pad, scale: 1 } });
  writeFileSync(join(out, file), Buffer.from(shot.result.data, 'base64'));
  console.log(`  logos/${file}`);
}

const page = (body) => `<!doctype html><html><head><style>html,body{margin:0;background:transparent}body{padding:40px}</style></head><body>${body}</body></html>`;
const mark = readFileSync(join(root, 'assets/favicon.svg'), 'utf8').replace(/width="64" height="64"/, 'width="100%" height="100%"');
writeFileSync(join(out, 'binder-mark.svg'), readFileSync(join(root, 'assets/favicon.svg')));
console.log('  logos/binder-mark.svg');
for (const size of [180, 512, 1024]) {
  await render(page(`<div id="x" style="width:${size}px;height:${size}px">${mark}</div>`), `binder-mark-${size}.png`);
}

// Same type settings as the site's .wordmark: weight 700, -0.05em tracking.
const word = (color) => page(`<span id="x" style="display:inline-block;font:700 240px/1 -apple-system,BlinkMacSystemFont,'SF Pro Display','Inter','Helvetica Neue',Arial,sans-serif;letter-spacing:-.05em;color:${color};padding:0 .06em .08em">binder.</span>`);
await render(word('#1D1D1F'), 'binder-wordmark-black.png', { scale: 2 });
await render(word('#FFFFFF'), 'binder-wordmark-white.png', { scale: 2 });
await render(word('#D95440'), 'binder-wordmark-coral.png', { scale: 2 });

// Chrome keeps writing to its profile while it shuts down; removing the
// directory before it exits fails with ENOTEMPTY.
ws.close();
const exited = new Promise((r) => chrome.once('exit', r));
chrome.kill();
await exited;
rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
