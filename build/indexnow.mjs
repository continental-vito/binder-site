// Submits every URL in sitemap.xml to IndexNow, which forwards to Bing,
// Yandex, Seznam and other participating engines. Bing's index also feeds
// ChatGPT search, so this is the fastest way to get new pages in front of it.
//
//   node build/indexnow.mjs <key>     (the key file <key>.txt must be live at the site root)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const key = process.argv[2];
if (!key) { console.error('indexnow: pass the key, e.g. make indexnow'); process.exit(1); }
const host = 'binder.red';
const urls = [...readFileSync(join(root, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

// IndexNow verifies ownership by fetching the key file, so check it first and
// fail with the reason rather than letting the engine reject us silently.
const keyUrl = `https://${host}/${key}.txt`;
const live = await fetch(keyUrl).then(async (r) => (r.ok ? (await r.text()).trim() : `HTTP ${r.status}`)).catch((e) => e.message);
if (live !== key) {
  // "fetch failed" means this machine could not reach the site at all — often
  // local or VPN DNS that has not picked up the domain yet — not that the key
  // is missing. Say which, so nobody republishes to fix a DNS cache.
  const why = /^HTTP /.test(live) ? `the site answered ${live} — is the key file published?` : `could not reach it from this machine (${live}) — check local/VPN DNS with: dig +short ${host}`;
  console.error(`indexnow: ${keyUrl}: ${why}`);
  process.exit(1);
}

const r = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host, key, keyLocation: keyUrl, urlList: urls }),
});
// 200 = accepted, 202 = accepted, key validation pending. Anything else is a failure.
if (r.status === 200 || r.status === 202) console.log(`indexnow: submitted ${urls.length} URLs (HTTP ${r.status})`);
else { console.error(`indexnow: HTTP ${r.status} ${await r.text()}`); process.exit(1); }
