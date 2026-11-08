/**
 * Launch-grade MOCK_CHAIN API workflow harness.
 *
 * Covers: seed auth → rules once → re-auth skip onboarding → fund → typed purchase
 * (match jury) → confirm → jars → buy (amount override) → buy progress → sell.
 *
 *   cd backend && npm run smoke:workflow
 *   HARNESS_FE_URL=http://127.0.0.1:3000 npm run smoke:workflow
 *
 * Pass = exit 0 and every step prints ok.
 */
import { generateKeyPairSync, sign } from 'node:crypto';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import postgres from 'postgres';

const BASE = process.env.HARNESS_API_URL || 'http://127.0.0.1:3001/api';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function b58(bytes: Uint8Array) {
  let n = BigInt('0x' + (Buffer.from(bytes).toString('hex') || '0'));
  let s = '';
  while (n > 0n) {
    s = B58[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    s = '1' + s;
  }
  return s || '1';
}

function solKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(12);
  return {
    address: b58(raw),
    signMsg: (m: string) => b58(sign(null, Buffer.from(m), privateKey)),
  };
}

type Jar = { cookie: string; csrf: string };

function parseSetCookie(res: Response): Jar {
  const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const list = raw.length ? raw : [res.headers.get('set-cookie') || ''];
  let cookie = '';
  let csrf = '';
  for (const line of list) {
    const parts = line.split(',').flatMap((p) => p.split(/,(?=[^;]+?=)/));
    for (const p of parts.length ? parts : [line]) {
      const m = p.match(/^\s*([^=]+)=([^;]*)/);
      if (!m) continue;
      const [, name, val] = m;
      if (name === 'ob_session' || name === 'ob_csrf') {
        cookie = cookie ? `${cookie}; ${name}=${val}` : `${name}=${val}`;
        if (name === 'ob_csrf') csrf = val;
      }
    }
  }
  // Fallback: single set-cookie header may contain both
  if (!csrf) {
    const all = list.join(';');
    const m = all.match(/ob_csrf=([^;]+)/);
    if (m) csrf = m[1]!;
    const s = all.match(/ob_session=([^;]+)/);
    if (s && !cookie.includes('ob_session')) cookie = `ob_session=${s[1]}; ob_csrf=${csrf}`;
  }
  if (!cookie || !csrf) throw new Error(`missing session cookies: ${JSON.stringify(list)}`);
  return { cookie, csrf };
}

async function api<T>(
  jar: Jar | null,
  method: string,
  path: string,
  body?: unknown,
  opts?: { idempotent?: boolean },
): Promise<{ status: number; json: T; jar: Jar | null; res: Response }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (jar) {
    headers.cookie = jar.cookie;
    headers['x-ob-csrf'] = jar.csrf;
  }
  if (opts?.idempotent) headers['Idempotency-Key'] = crypto.randomUUID();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const next = res.headers.has('set-cookie') || (res.headers.getSetCookie?.().length ?? 0) > 0 ? parseSetCookie(res) : jar;
  const json = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, json, jar: next, res };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function step(name: string) {
  process.stdout.write(`· ${name} … `);
}

function ok(extra = '') {
  console.log(`ok${extra ? ` ${extra}` : ''}`);
}

async function main() {
  console.log(`Ownback workflow harness → ${BASE}`);
  const health = await fetch(`${BASE}/health`);
  assert(health.ok, `API not healthy: ${health.status}`);
  ok('health');

  // ── Auth (seed) ──────────────────────────────────────────────────────────
  step('seed auth');
  const evm = privateKeyToAccount(generatePrivateKey());
  const sol = solKeys();
  const nonceRes = await api<{ nonce: string; message: string }>(null, 'GET', '/auth/seed/nonce');
  assert(nonceRes.status === 200 && nonceRes.json.nonce, 'nonce failed');
  const message = nonceRes.json.message;
  const signed = await api<{ user: { id: string; onboarded: boolean; solAddress?: string } }>(
    null,
    'POST',
    '/auth/seed',
    {
      evmAddress: evm.address,
      solAddress: sol.address,
      nonce: nonceRes.json.nonce,
      evmSignature: await evm.signMessage({ message }),
      solSignature: sol.signMsg(message),
    },
  );
  assert(signed.status === 200, `auth failed ${signed.status} ${JSON.stringify(signed.json)}`);
  let jar = signed.jar!;
  const userId = signed.json.user.id;
  assert(signed.json.user.onboarded === false, 'fresh user should not be onboarded');
  ok(`user=${userId.slice(0, 8)} onboarded=false`);

  // ── Rules once ───────────────────────────────────────────────────────────
  step('put rules (onboard)');
  const rules = await api<{ rateBps: number; onchainSynced: boolean }>(jar, 'PUT', '/rules', {
    rateBps: 500,
    monthlyCapUsd6: '50000000',
    readyMinUsd6: '1000000', // $1 so small jars can be ready in tests
  });
  assert(rules.status === 200, `put rules ${rules.status} ${JSON.stringify(rules.json)}`);
  jar = rules.jar!;

  const me1 = await api<{ onboarded: boolean }>(jar, 'GET', '/me');
  assert(me1.json.onboarded === true, 'expected onboarded after PUT /rules');
  ok('onboarded=true');

  // Re-auth must stay onboarded (the original bug).
  step('re-auth skips rules');
  const nonce2 = await api<{ nonce: string; message: string }>(null, 'GET', '/auth/seed/nonce');
  const signed2 = await api<{ user: { onboarded: boolean } }>(null, 'POST', '/auth/seed', {
    evmAddress: evm.address,
    solAddress: sol.address,
    nonce: nonce2.json.nonce,
    evmSignature: await evm.signMessage({ message: nonce2.json.message }),
    solSignature: sol.signMsg(nonce2.json.message),
  });
  assert(signed2.json.user.onboarded === true, 'returning user must stay onboarded');
  jar = signed2.jar!;
  ok();

  // ── Fund vault (MOCK: recorded Arc deposit) ──────────────────────────────
  step('fund $100 Arc deposit');
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  await sql`
    INSERT INTO deposits (id, user_id, chain, tx_hash, from_address, token, amount_usd6, status, confirmations, seen_at, added_at)
    VALUES (
      gen_random_uuid(), ${userId}::uuid, 'arc', ${`harness-${Date.now()}`},
      ${evm.address}, 'USDC', 100000000::bigint, 'added', 1, now(), now()
    )
  `;
  const home = await api<{
    balance: { usdc: { freeUsd6: string; inJarsUsd6: string }; byType: { stocksCommodities: string } };
  }>(jar, 'GET', '/home');
  assert(BigInt(home.json.balance.usdc.freeUsd6) >= 100_000_000n, `expected funded free, got ${JSON.stringify(home.json.balance)}`);
  ok(`free=${home.json.balance.usdc.freeUsd6}`);

  // ── Typed purchase → match jury ──────────────────────────────────────────
  step('typed purchase iPhone (jury)');
  const created = await api<{ purchaseId: string }>(
    jar,
    'POST',
    '/purchases',
    { text: { product: 'Apple iPhone 16 Pro', amount: '200.00', currency: 'USD', maker: 'Apple' } },
    { idempotent: true },
  );
  assert(created.status === 200 || created.status === 201, `create purchase ${created.status} ${JSON.stringify(created.json)}`);
  const purchaseId = created.json.purchaseId;
  assert(purchaseId, 'no purchaseId');

  let purchase: {
    status: string;
    investUsd6?: string;
    allocations: { assetId: string; role: string; amountUsd6: string; why?: string; selected: boolean }[];
  } | null = null;
  for (let i = 0; i < 40; i++) {
    const p = await api<typeof purchase>(jar, 'GET', `/purchases/${purchaseId}`);
    purchase = p.json;
    if (purchase && purchase.status !== 'reading') break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert(purchase && purchase.status !== 'reading' && purchase.status !== 'read_failed', `read stuck: ${JSON.stringify(purchase)}`);
  assert(purchase!.allocations?.length >= 1, 'expected allocations');
  const apple = purchase!.allocations.find((a) => a.assetId === 'co:apple');
  assert(apple, `expected co:apple in ${purchase!.allocations.map((a) => a.assetId)}`);
  // Jury seed graph should attach behind/materials for iPhone when catalog has them.
  const behind = purchase!.allocations.filter((a) => a.role === 'supplier');
  const mats = purchase!.allocations.filter((a) => a.role === 'material');
  assert(behind.length >= 1 || mats.length >= 1, `expected supply/materials jury rows, got ${JSON.stringify(purchase!.allocations)}`);
  assert(purchase!.allocations.every((a) => !a.why || a.why.length <= 200), 'why too long');
  ok(`status=${purchase!.status} allocs=${purchase!.allocations.length} invest=${purchase!.investUsd6}`);

  // ── Confirm → jars ───────────────────────────────────────────────────────
  step('confirm purchase');
  const conf = await api<{ action: { kind: string } }>(jar, 'POST', `/purchases/${purchaseId}/confirm`, {}, { idempotent: true });
  assert(conf.status === 200, `confirm ${conf.status} ${JSON.stringify(conf.json)}`);
  const submitted = await api<unknown>(jar, 'POST', `/purchases/${purchaseId}/confirm/submitted`, { txHash: 'mock' });
  assert(submitted.status === 200, `submitted ${submitted.status} ${JSON.stringify(submitted.json)}`);
  ok();

  step('jars ready');
  const jars = await api<{ jars: { assetId: string; amountUsd6: string; state: string }[] }>(jar, 'GET', '/jars');
  assert(jars.json.jars?.length >= 1, `no jars ${JSON.stringify(jars.json)}`);
  const appleJar = jars.json.jars.find((j) => j.assetId === 'co:apple');
  assert(appleJar, 'no apple jar');
  ok(`jars=${jars.json.jars.length} apple=${appleJar!.amountUsd6} state=${appleJar!.state}`);

  // ── Buy with small override ──────────────────────────────────────────────
  step('buy review + $0.50 override');
  const override = '500000'; // $0.50
  const review = await api<{
    quoteId: string;
    rows: {
      assetId: string;
      selectable: boolean;
      mint?: string;
      decimals?: number;
      estQty: string;
      amountUsd6: string;
      reason?: string;
    }[];
    approval: { typedData: unknown };
    totalUsd6: string;
  }>(jar, 'POST', '/buys/review', { include: 'all', amounts: { 'co:apple': override } }, { idempotent: true });
  assert(review.status === 200, `review ${review.status} ${JSON.stringify(review.json)}`);
  const appleRow = review.json.rows.find((r) => r.assetId === 'co:apple');
  assert(appleRow, 'apple missing from review');
  assert(appleRow!.selectable, `apple not selectable: ${appleRow!.reason}`);
  assert(appleRow!.mint && appleRow!.decimals === 8, `verified mint/decimals missing ${JSON.stringify(appleRow)}`);
  assert(appleRow!.amountUsd6 === override, `override not applied ${appleRow!.amountUsd6}`);
  assert(BigInt(appleRow!.estQty.split('.')[0] || '0') >= 0n || appleRow!.estQty.includes('.'), 'estQty missing');
  ok(`qty≈${appleRow!.estQty} mint=${appleRow!.mint!.slice(0, 6)}…`);

  step('execute buy');
  const buy = await api<{ batchIds: string[] }>(
    jar,
    'POST',
    '/buys',
    { quoteId: review.json.quoteId, approval: review.json.approval.typedData, signature: 'harness-mock-sig' },
    { idempotent: true },
  );
  assert(buy.status === 200, `buy ${buy.status} ${JSON.stringify(buy.json)}`);
  const batchId = buy.json.batchIds?.[0];
  assert(batchId, 'no batchId');

  const progress = await api<{
    status: string;
    entries: { status: string; venueTx?: string; explorerUrl?: string; qty?: string; spentUsd6?: string }[];
    totals?: { boughtUsd6: string };
  }>(jar, 'GET', `/buys/${batchId}`);
  assert(progress.status === 200, `progress ${progress.status}`);
  assert(/^done/.test(progress.json.status), `batch not done: ${progress.json.status}`);
  const bought = progress.json.entries.filter((e) => e.status === 'bought');
  assert(bought.length >= 1, `no bought entries ${JSON.stringify(progress.json.entries)}`);
  assert(bought[0]!.venueTx, 'missing venueTx');
  // mock venue_tx has no explorer; real would
  ok(`batch=${progress.json.status} spent=${bought[0]!.spentUsd6} qty=${bought[0]!.qty}`);

  // ── Sell ─────────────────────────────────────────────────────────────────
  step('sell review + execute');
  const holding = await api<{ qty?: string; valueUsd6: string }>(jar, 'GET', `/holdings/${encodeURIComponent('co:apple')}`);
  assert(holding.status === 200 && holding.json.qty, `holding ${JSON.stringify(holding.json)}`);
  const sellReview = await api<{
    quoteId: string;
    action: { kind: string };
    estUsdcUsd6: string;
    mint?: string;
    decimals?: number;
  }>(jar, 'GET', `/sells/review?assetId=${encodeURIComponent('co:apple')}`);
  assert(sellReview.status === 200, `sell review ${sellReview.status} ${JSON.stringify(sellReview.json)}`);
  assert(sellReview.json.mint && sellReview.json.decimals === 8, 'sell missing verified mint');
  const sold = await api<{ sellId: string }>(
    jar,
    'POST',
    '/sells',
    { quoteId: sellReview.json.quoteId, txHash: 'mock' },
    { idempotent: true },
  );
  assert(sold.status === 200, `sell ${sold.status} ${JSON.stringify(sold.json)}`);
  const sellDone = await api<{ status: string; receivedUsd6?: string }>(jar, 'GET', `/sells/${sold.json.sellId}`);
  assert(sellDone.json.status === 'done', `sell not done ${JSON.stringify(sellDone.json)}`);
  ok(`received=${sellDone.json.receivedUsd6}`);

  // ── Settings edit must not clear onboarded ───────────────────────────────
  step('settings edit keeps onboarded');
  await api(jar, 'PUT', '/rules', { maxFeeBps: 400 });
  const me2 = await api<{ onboarded: boolean }>(jar, 'GET', '/me');
  assert(me2.json.onboarded === true, 'settings edit cleared onboarded');
  ok();

  await sql.end();

  // Optional: frontend rewrite proxy + cold-ish page when HARNESS_FE_URL is set.
  const fe = (process.env.HARNESS_FE_URL || '').replace(/\/$/, '');
  if (fe) {
    step('frontend /api/health proxy');
    const proxied = await fetch(`${fe}/api/health`);
    const body = await proxied.json().catch(() => ({}));
    assert(proxied.ok && (body as { ok?: boolean }).ok === true, `FE proxy health ${proxied.status}`);
    ok();
    step('frontend /signin HTML');
    const page = await fetch(`${fe}/signin`);
    const html = await page.text();
    assert(page.ok && /Ownback/i.test(html), `FE /signin ${page.status}`);
    ok(`bytes=${html.length}`);
  }

  console.log('\nPASS — full workflow harness');
}

main().catch((e) => {
  console.error('\nFAIL', e);
  process.exit(1);
});
