import { Hono } from 'hono';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '../db/client.js';
import { ApiError } from '../shared/errors.js';
import {
  clearSessionCookies,
  createSession,
  jsonError,
  mePayload,
  mockEvmAction,
  requireCsrf,
  requireUser,
  setSessionCookies,
} from '../lib/http.js';
import { mockChain } from '../lib/env.js';
import { newId, referralCode } from '../lib/ids.js';

export const authRoutes = new Hono();

authRoutes.post('/auth/google/device-token', async (c) => {
  try {
    const body = z.object({ deviceId: z.string().min(1) }).parse(await c.req.json());
    if (!process.env.CIRCLE_APP_ID && !mockChain()) throw new ApiError('UPSTREAM');
    // MOCK: Circle device token; real Circle call when CIRCLE_APP_ID + keys set
    const deviceToken = `mock_device_${createHash('sha256').update(body.deviceId).digest('hex').slice(0, 24)}`;
    return c.json({
      deviceToken,
      deviceEncryptionKey: randomBytes(32).toString('base64'),
      appId: process.env.CIRCLE_APP_ID || process.env.NEXT_PUBLIC_CIRCLE_APP_ID || 'mock-app',
    });
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

authRoutes.post('/auth/google', async (c) => {
  try {
    const body = z
      .object({ userToken: z.string().min(1), encryptionKey: z.string().min(1) })
      .parse(await c.req.json());
    const country = c.req.header('x-vercel-ip-country') || c.req.header('cf-ipcountry');
    if (country === 'US') throw new ApiError('GEO_BLOCKED');

    const sql = getSql();
    // Without Circle API: derive a stable mock circle_user_id from the token (MOCK_CHAIN / missing keys).
    const circleUserId = `g_${createHash('sha256').update(body.userToken).digest('hex').slice(0, 32)}`;
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE circle_user_id = ${circleUserId} LIMIT 1
    `;

    let userId: string;
    let setup: ReturnType<typeof mockEvmAction> | undefined;
    if (existing[0]) {
      userId = existing[0].id;
    } else {
      userId = newId();
      const name = 'You';
      await sql`
        INSERT INTO users (id, auth_kind, circle_user_id, email, display_name, referral_code, country, created_at)
        VALUES (
          ${userId}::uuid, 'google', ${circleUserId}, NULL, ${name},
          ${referralCode(name)}, ${country ?? null}, now()
        )
      `;
      await sql`
        INSERT INTO rules (user_id, updated_at) VALUES (${userId}::uuid, now())
      `;
      setup = mockEvmAction('Create your Ownback wallets');
    }

    const sid = await createSession(userId, c.req.header('user-agent') ?? undefined);
    setSessionCookies(c, sid);
    const urows = await sql<{
      id: string;
      auth_kind: 'google' | 'seed';
      email: string | null;
      display_name: string;
      evm_address: string | null;
      sol_address: string | null;
      referral_code: string;
    }[]>`SELECT id, auth_kind, email, display_name, evm_address, sol_address, referral_code FROM users WHERE id = ${userId}::uuid`;
    const row = urows[0]!;
    const u = {
      id: row.id,
      authKind: row.auth_kind,
      email: row.email,
      displayName: row.display_name,
      evmAddress: row.evm_address,
      solAddress: row.sol_address,
      referralCode: row.referral_code,
      sessionId: sid,
    };
    const rules = await sql`SELECT 1 FROM rules WHERE user_id = ${userId}::uuid AND onchain_synced_at IS NOT NULL`;
    return c.json({ user: mePayload(u, rules.length > 0), ...(setup ? { setup } : {}) });
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

authRoutes.post('/auth/google/setup/submitted', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    z.object({ challengeIds: z.array(z.string()).min(1) }).parse(await c.req.json());
    const sql = getSql();
    // MOCK_CHAIN: inventing addresses is forbidden for production; placeholder only when mock.
    if (!mockChain()) throw new ApiError('UPSTREAM');
    const evm = `0x${createHash('sha256').update(user.id + 'evm').digest('hex').slice(0, 40)}`;
    const sol = createHash('sha256').update(user.id + 'sol').digest('base64url').slice(0, 44);
    await sql`
      UPDATE users SET evm_address = ${evm}, sol_address = ${sol}
      WHERE id = ${user.id}::uuid
    `;
    const u = await requireUser(c);
    return c.json({ user: mePayload({ ...u, evmAddress: evm, solAddress: sol }, false) });
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

authRoutes.get('/auth/seed/nonce', async (c) => {
  const sql = getSql();
  const nonce = randomBytes(16).toString('hex');
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await sql`INSERT INTO auth_nonces (nonce, expires_at) VALUES (${nonce}, ${expires})`;
  const message = `Ownback sign-in\nnonce:${nonce}`;
  return c.json({ nonce, message });
});

authRoutes.post('/auth/seed', async (c) => {
  try {
    const body = z
      .object({
        evmAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        solAddress: z.string().min(32),
        evmSignature: z.string().min(1),
        solSignature: z.string().min(1),
        nonce: z.string().min(1),
      })
      .parse(await c.req.json());

    const sql = getSql();
    const nonceRows = await sql<{ used_at: Date | null; expires_at: Date }[]>`
      SELECT used_at, expires_at FROM auth_nonces WHERE nonce = ${body.nonce} LIMIT 1
    `;
    const n = nonceRows[0];
    if (!n || n.expires_at.getTime() < Date.now()) throw new ApiError('AUTH_INVALID');
    if (n.used_at) throw new ApiError('NONCE_USED');

    // Full ECDSA + ed25519 verify lands with packages/shared + viem. MOCK_CHAIN accepts non-empty sigs.
    if (!mockChain()) throw new ApiError('UPSTREAM');
    if (!body.evmSignature || !body.solSignature) throw new ApiError('AUTH_INVALID');

    await sql`UPDATE auth_nonces SET used_at = now() WHERE nonce = ${body.nonce}`;

    const existing = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE evm_address = ${body.evmAddress} OR sol_address = ${body.solAddress} LIMIT 1
    `;
    let userId: string;
    if (existing[0]) {
      userId = existing[0].id;
    } else {
      userId = newId();
      await sql`
        INSERT INTO users (id, auth_kind, display_name, evm_address, sol_address, referral_code, created_at)
        VALUES (
          ${userId}::uuid, 'seed', 'You', ${body.evmAddress}, ${body.solAddress},
          ${referralCode('You')}, now()
        )
      `;
      await sql`INSERT INTO rules (user_id, updated_at) VALUES (${userId}::uuid, now())`;
    }

    const sid = await createSession(userId, c.req.header('user-agent') ?? undefined);
    setSessionCookies(c, sid);
    const urows = await sql<{
      id: string;
      auth_kind: 'google' | 'seed';
      email: string | null;
      display_name: string;
      evm_address: string | null;
      sol_address: string | null;
      referral_code: string;
    }[]>`SELECT id, auth_kind, email, display_name, evm_address, sol_address, referral_code FROM users WHERE id = ${userId}::uuid`;
    const row = urows[0]!;
    const u = {
      id: row.id,
      authKind: row.auth_kind,
      email: row.email,
      displayName: row.display_name,
      evmAddress: row.evm_address,
      solAddress: row.sol_address,
      referralCode: row.referral_code,
      sessionId: sid,
    };
    const rules = await sql`SELECT onchain_synced_at FROM rules WHERE user_id = ${userId}::uuid`;
    return c.json({ user: mePayload(u, !!rules[0]?.onchain_synced_at) });
  } catch (e) {
    return jsonError(c, e instanceof z.ZodError ? new ApiError('VALIDATION', { issues: e.issues }) : e);
  }
});

authRoutes.post('/auth/logout', async (c) => {
  try {
    requireCsrf(c);
    const user = await requireUser(c);
    const body = z.object({ everywhere: z.boolean().optional() }).parse(await c.req.json().catch(() => ({})));
    const sql = getSql();
    if (body.everywhere) {
      await sql`DELETE FROM sessions WHERE user_id = ${user.id}::uuid`;
    } else {
      await sql`DELETE FROM sessions WHERE id = ${user.sessionId}`;
    }
    clearSessionCookies(c);
    return c.body(null, 204);
  } catch (e) {
    return jsonError(c, e);
  }
});
