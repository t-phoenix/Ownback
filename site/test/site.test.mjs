import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SITE_DEV = '1';
delete process.env.DATABASE_URL;
process.env.ADMIN_PASSWORD = 'correct-horse-battery';
process.env.ADMIN_SECRET = 'x'.repeat(40);
process.env.APP_URL = 'https://app.example.test';

const { normEmail, cleanText, csvCell } = await import('../lib/valid.js');
const { makeToken, tokenOk, passwordOk } = await import('../lib/auth.js');
const join = (await import('../api/join.js')).default;
const access = (await import('../api/access.js')).default;
const admin = (await import('../api/admin.js')).default;

function call(h, { method = 'POST', body, url = '/', headers = {} } = {}) {
  return new Promise((resolve) => {
    const out = { headers: {} };
    const res = {
      statusCode: 200,
      setHeader: (k, v) => (out.headers[k.toLowerCase()] = v),
      end: (s) => resolve({ status: res.statusCode, headers: out.headers, json: (() => { try { return JSON.parse(s); } catch { return s; } })() }),
    };
    h({ method, body, url, headers: { host: 'site.test', 'x-forwarded-for': '1.2.3.4', ...headers } }, res);
  });
}

test('email and text rules', () => {
  assert.equal(normEmail('  A@B.co '), 'a@b.co');
  assert.equal(normEmail('nope'), null);
  assert.equal(normEmail('a@b.c'), null);
  assert.equal(cleanText('  hi\u0007 ', 10), 'hi');
  assert.equal(cleanText('abcdef', 3), 'abc');
  assert.equal(csvCell('=SUM(A1)'), `"'=SUM(A1)"`);
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
});

test('admin token and password', () => {
  const t = makeToken();
  assert.ok(tokenOk(t));
  assert.ok(!tokenOk(t + 'x'));
  assert.ok(!tokenOk(makeToken(Date.now() - 13 * 3600 * 1000)));
  assert.ok(passwordOk('correct-horse-battery'));
  assert.ok(!passwordOk('wrong'));
});

test('join → gate says waiting → admin approves → gate returns app URL', async () => {
  const j = await call(join, { body: { email: 'Riya@Example.com', why: 'I buy a lot', newsletter: true } });
  assert.equal(j.status, 200);
  assert.equal(j.json.position, 1);
  const again = await call(join, { body: { email: 'riya@example.com' } });
  assert.equal(again.json.position, 1, 'rejoining keeps the same place');

  assert.equal((await call(access, { body: { email: 'riya@example.com' } })).json.status, 'waiting');
  assert.equal((await call(access, { body: { email: 'other@example.com' } })).json.status, 'none');

  assert.equal((await call(admin, { method: 'GET', url: '/api/admin?action=list' })).status, 401);
  const bad = await call(admin, { body: { action: 'login', password: 'nope' } });
  assert.equal(bad.status, 401);
  const ok = await call(admin, { body: { action: 'login', password: 'correct-horse-battery' } });
  assert.equal(ok.status, 200);
  const cookie = ok.headers['set-cookie'].split(';')[0];
  const listed = await call(admin, { method: 'GET', url: '/api/admin?action=list', headers: { cookie } });
  assert.equal(listed.json.rows[0].email, 'riya@example.com');
  assert.equal(listed.json.rows[0].why, 'I buy a lot');

  await call(admin, { body: { action: 'status', id: listed.json.rows[0].id, status: 'approved' }, headers: { cookie } });
  const gate = await call(access, { body: { email: 'riya@example.com' } });
  assert.deepEqual(gate.json, { status: 'approved', url: 'https://app.example.test' });

  await call(admin, { body: { action: 'grant', email: 'investor@fund.vc' }, headers: { cookie } });
  assert.equal((await call(access, { body: { email: 'investor@fund.vc' } })).json.status, 'approved');

  const csv = await call(admin, { method: 'GET', url: '/api/admin?action=export', headers: { cookie } });
  assert.match(csv.json, /riya@example.com/);
});

test('honeypot, bad email, cross-site and rate limit', async () => {
  assert.equal((await call(join, { body: { email: 'bot@x.com', company: 'Acme' } })).json.position, 0);
  assert.equal((await call(join, { body: { email: 'bad' } })).status, 400);
  assert.equal((await call(join, { body: { email: 'a@b.co' }, headers: { origin: 'https://evil.test' } })).status, 403);
  let last;
  for (let i = 0; i < 9; i++) last = await call(join, { body: { email: `n${i}@b.co` }, headers: { 'x-forwarded-for': '9.9.9.9' } });
  assert.equal(last.status, 429);
});
