// The contact form is the only way a visitor reaches us, and every way it can
// fail is silent from our side: a request we never receive looks exactly like
// a visitor who never wrote. These tests pin the cases that would lose a lead
// or, worse, tell someone "received" when nothing was sent.

const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/contact.js');
const { validate, compose } = handler;

const human = { name: 'Giulia Russo', email: 'Giulia@LumenGrid.io ', role: 'founder', intent: 'demo', elapsed_ms: 40000 };

function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.send = (b) => { res.body = JSON.parse(b); return res; };
  return res;
}

async function withEnv(env, fn) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  try { return await fn(); } finally { process.env = saved; }
}

test('a normal request is accepted and the email is normalised', () => {
  const r = validate(human);
  assert.equal(r.value.email, 'giulia@lumengrid.io');
  assert.equal(r.value.role, 'founder');
});

test('honeypot and instant submits are treated as spam, not errors', () => {
  // If these returned an error, bots would retry; if they were sent, the inbox fills.
  assert.deepEqual(validate({ ...human, website: 'http://spam.example' }), { spam: true });
  assert.deepEqual(validate({ ...human, elapsed_ms: 300 }), { spam: true });
});

test('a slow-loading page without a timer is not mistaken for a bot', () => {
  // Older cached copies of the page may not send elapsed_ms at all.
  const { elapsed_ms, ...noTimer } = human;
  assert.ok(validate(noTimer).value);
});

test('missing name and malformed email are rejected with a reason the page can show', () => {
  assert.equal(validate({ ...human, name: '   ' }).error, 'missing_name');
  assert.equal(validate({ ...human, email: 'giulia@lumengrid' }).error, 'invalid_email');
  assert.equal(validate(null).error, 'missing_name');
});

test('unknown role and intent fall back to allow-listed values', () => {
  // These end up in the email subject; free text there would let anyone
  // write arbitrary subjects into our inbox.
  const r = validate({ ...human, role: 'admin<script>', intent: 'x' });
  assert.equal(r.value.role, 'other');
  assert.equal(r.value.intent, 'call');
});

test('the subject says who wrote and what they want', () => {
  const { subject, text } = compose(validate({ ...human, company: 'Lumen Grid' }).value);
  assert.match(subject, /^Live demo — Giulia Russo \(Lumen Grid\) · Founder$/);
  assert.match(text, /giulia@lumengrid\.io/);
});

test('without credentials the route says not_configured instead of faking success', async () => {
  await withEnv({ RESEND_API_KEY: undefined, CONTACT_TO: undefined }, async () => {
    const res = fakeRes();
    const origError = console.error; console.error = () => {};
    try { await handler({ method: 'POST', body: human }, res); } finally { console.error = origError; }
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { ok: false, error: 'not_configured' });
  });
});

test('a configured route sends to every recipient with reply-to set to the visitor', async () => {
  await withEnv({ RESEND_API_KEY: 're_test', CONTACT_TO: 'a@binder.test, b@binder.test' }, async () => {
    const calls = [];
    const origFetch = global.fetch;
    global.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, text: async () => '{}' }; };
    try {
      const res = fakeRes();
      await handler({ method: 'POST', body: JSON.stringify(human) }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0].body.to, ['a@binder.test', 'b@binder.test']);
      assert.equal(calls[0].body.reply_to, 'giulia@lumengrid.io');
    } finally { global.fetch = origFetch; }
  });
});

test('an upstream failure is reported as a failure', async () => {
  await withEnv({ RESEND_API_KEY: 're_test', CONTACT_TO: 'a@binder.test' }, async () => {
    const origFetch = global.fetch, origError = console.error;
    global.fetch = async () => ({ ok: false, status: 403, text: async () => '{"message":"domain not verified"}' });
    console.error = () => {};
    try {
      const res = fakeRes();
      await handler({ method: 'POST', body: human }, res);
      assert.equal(res.statusCode, 502);
      assert.equal(res.body.ok, false);
    } finally { global.fetch = origFetch; console.error = origError; }
  });
});

test('GET is refused', async () => {
  const res = fakeRes();
  await handler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 405);
});
