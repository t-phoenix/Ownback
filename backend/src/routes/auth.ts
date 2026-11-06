import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getSql } from '../db/client.js';
import { ApiError } from '../shared/errors.js';
import {
  clearSessionCookies,
  createSession,
  jsonError,
  mePayload,
  requireCsrf,
  requireUser,
  setSessionCookies,
  type AuthedUser,
} from '../lib/http.js';
import { mockChain } from '../lib/env.js';
import { newId, referralCode } from '../lib/ids.js';
import { resolvePrivyIdentity } from '../lib/privy.js';

export const authRoutes = new Hono();

type AuthKind = AuthedUser['authKind'];

async function loadUserRow(userId: string): Promise<AuthedUser> {
  const sql = getSql();
  const urows = await sql<{
    id: string;
    auth_kind: AuthKind;
    email: string | null;
    display_name: string;
    evm_address: string | null;
    sol_address: string | null;
    referral_code: string;
  }[]>`SELECT id, auth_kind, email, display_name, evm_address, sol_address, referral_code FROM users WHERE id = ${userId}::uuid`;
  const row = urows[0]!;
  return {
    id: row.id,
    authKind: row.auth_kind === 'google' ? 'privy' : row.auth_kind,
    email: row.email,
    displayName: row.display_name,
    evmAddress: row.evm_address,
    solAddress: row.sol_address,
    referralCode: row.referral_code,
    sessionId: '',
  };
}

authRoutes.post('/auth/privy', async (c) => {
  try {
    const body = z
      .object({
        accessToken: z.string().min(1),
        // Allowed under MOCK_CHAIN so wireframes can pass addresses without Privy dashboard.
        evmAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
        solAddress: z.string().min(32).optional(),
        email: z.string().email().optional(),
      })
      .parse(await c.req.json());

    const country = c.req.header('x-vercel-ip-country') || c.req.header('cf-ipcountry');
    if (country === 'US') throw new ApiError('GEO_BLOCKED');

    const identity = await resolvePrivyIdentity(body.accessToken, {
      evmAddress: body.evmAddress,
      solAddress: body.solAddress,
      email: body.email,
    });

    const sql = getSql();
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM users
      WHERE privy_did = ${identity.did}
         OR circle_user_id = ${identity.did}
      LIMIT 1
    `;

    let userId: string;
    if (existing[0]) {
      userId = existing[0].id;
      await sql`
        UPDATE users SET
          auth_kind = 'privy',
          privy_did = ${identity.did},
          email = COALESCE(${identity.email}, email),
          display_name = COALESCE(${identity.displayName}, display_name),
          evm_address = COALESCE(${identity.evmAddress}, evm_address),
          sol_address = COALESCE(${identity.solAddress}, sol_address)
        WHERE id = ${userId}::uuid
      `;
    } else {
      userId = newId();
      const name = identity.displayName || 'You';
      await sql`
        INSERT INTO users (
          id, auth_kind, privy_did, circle_user_id, email, display_name,
          evm_address, sol_address, referral_code, country, created_at
        ) VALUES (
          ${userId}::uuid, 'privy', ${identity.did}, ${identity.did},
          ${identity.email}, ${name},
          ${identity.evmAddress}, ${identity.solAddress},
          ${referralCode(name)}, ${country ?? null}, now()
        )
      `;
      await sql`INSERT INTO rules (user_id, updated_at) VALUES (${userId}::uuid, now())`;
    }

    const sid = await createSession(userId, c.req.header('user-agent') ?? undefined);
    setSessionCookies(c, sid);
    const u = await loadUserRow(userId);
    u.sessionId = sid;
    const rules = await sql`SELECT onchain_synced_at FROM rules WHERE user_id = ${userId}::uuid`;
    return c.json({ user: mePayload(u, !!rules[0]?.onchain_synced_at) });
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
    const u = await loadUserRow(userId);
    u.sessionId = sid;
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
