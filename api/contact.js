// POST /api/contact  →  emails a demo / call / pilot request to the team
//
// Runs on Vercel as a Node serverless function. Delivery goes through Resend
// because its API key is a server-side secret — that is the whole reason this
// route exists instead of the form posting to a third party from the browser.
//
// Environment variables (Vercel → Settings → Environment Variables):
//   RESEND_API_KEY  required. resend.com → API Keys → Create (Sending access)
//   CONTACT_TO      required. Inbox that receives requests; comma-separate for several
//   CONTACT_FROM    optional. Defaults to Resend's shared sender, which can only
//                   deliver to the Resend account's own address until a domain
//                   is verified there.

const RESEND_API = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Binder <onboarding@resend.dev>';

// Deliberately permissive: reject typos and junk, not RFC 5322 edge cases.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const ROLES = { founder: 'Founder', investor: 'Angel / VC', backer: 'Interested in backing Binder', other: 'Other' };
const INTENTS = { demo: 'Live demo', call: 'Call with the founders', pilot: 'Join the pilot' };

// A human takes longer than this to fill in a name and an email. Bots that
// post the form instantly are dropped without telling them why.
const MIN_FILL_MS = 2500;

function clean(v, max) {
  return String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, max);
}

// Pure, so the tests can exercise every branch without a network.
function validate(body) {
  body = body || {};
  if (clean(body.website, 200)) return { spam: true };
  const elapsed = Number(body.elapsed_ms);
  if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_FILL_MS) return { spam: true };

  const email = clean(body.email, 320).toLowerCase();
  const name = clean(body.name, 120);
  if (!name) return { error: 'missing_name' };
  if (!email || !EMAIL_RE.test(email)) return { error: 'invalid_email' };

  return {
    value: {
      name,
      email,
      role: ROLES[body.role] ? body.role : 'other',
      intent: INTENTS[body.intent] ? body.intent : 'call',
      company: clean(body.company, 160),
      message: clean(body.message, 3000),
      page: clean(body.page, 300),
    },
  };
}

function compose(v) {
  const subject = `${INTENTS[v.intent]} — ${v.name}${v.company ? ` (${v.company})` : ''} · ${ROLES[v.role]}`;
  const text = [
    `${INTENTS[v.intent]} request from binder landing page`,
    '',
    `Name:     ${v.name}`,
    `Email:    ${v.email}`,
    `Role:     ${ROLES[v.role]}`,
    `Company:  ${v.company || '—'}`,
    '',
    v.message || '(no message)',
    '',
    v.page ? `Sent from ${v.page}` : '',
  ].join('\n');
  return { subject, text };
}

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(body));
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }

  const checked = validate(body);
  if (checked.spam) {
    // Report success so the bot moves on; log it so a false positive on a
    // real person is visible in the Vercel function logs.
    console.warn('[contact] dropped as spam (honeypot or instant submit)');
    return json(res, 200, { ok: true });
  }
  if (checked.error) return json(res, 400, { ok: false, error: checked.error });

  const apiKey = process.env.RESEND_API_KEY;
  const to = (process.env.CONTACT_TO || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!apiKey || !to.length) {
    // Never pretend a request was delivered. The page turns this into a
    // prefilled email when CONTACT_EMAIL is set in its config.
    console.error('[contact] not configured: set RESEND_API_KEY and CONTACT_TO in Vercel, then redeploy');
    return json(res, 503, { ok: false, error: 'not_configured' });
  }

  const { subject, text } = compose(checked.value);
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(RESEND_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM || DEFAULT_FROM,
        to,
        reply_to: checked.value.email,
        subject,
        text,
      }),
      signal: ctl.signal,
    });
    if (!r.ok) {
      // Status and Resend's message only — never the key or the visitor's details.
      const detail = (await r.text()).slice(0, 400);
      console.error('[contact] resend %d: %s', r.status, detail);
      if (r.status === 429) return json(res, 429, { ok: false, error: 'rate_limited' });
      return json(res, 502, { ok: false, error: 'upstream_error' });
    }
    return json(res, 200, { ok: true });
  } catch (err) {
    const aborted = err && err.name === 'AbortError';
    console.error('[contact] %s: %s', aborted ? 'timeout' : 'network', err && err.message);
    return json(res, 504, { ok: false, error: aborted ? 'timeout' : 'network_error' });
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = handler;
module.exports.validate = validate;
module.exports.compose = compose;
