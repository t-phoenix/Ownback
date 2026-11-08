import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { ApiError, type ErrorCode } from '../shared/errors.js';
import { SESSION_MAX_MS, SESSION_SLIDE_MS } from '../shared/timing.js';
import { getSql } from '../db/client.js';
import { sessionId } from './ids.js';

export type AuthedUser = {
  id: string;
  authKind: 'privy' | 'seed' | 'google';
  email: string | null;
  displayName: string;
  evmAddress: string | null;
  solAddress: string | null;
  referralCode: string;
  sessionId: string;
};

export function jsonError(c: Context, err: unknown) {
  if (err instanceof ApiError) {
    return c.json(err.body(), err.http as 400);
  }
  console.error(err);
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  // Neon/postgres connection blips → retryable UPSTREAM (not opaque 500 that breaks the session UI).
  if (
    code === 'CONNECT_TIMEOUT' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'CONNECTION_ENDED' ||
    code === 'CONNECTION_DESTROYED'
  ) {
    return c.json(new ApiError('UPSTREAM').body(), 502);
  }
  const body = new ApiError('INTERNAL').body();
  return c.json(body, 500);
}

export async function createSession(userId: string, userAgent?: string): Promise<string> {
  const sql = getSql();
  const id = sessionId();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_MAX_MS);
  await sql`
    INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, user_agent)
    VALUES (${id}, ${userId}::uuid, ${now}, ${now}, ${expires}, ${userAgent ?? null})
  `;
  return id;
}

export function setSessionCookies(c: Context, sid: string) {
  const secure = process.env.NODE_ENV === 'production';
  setCookie(c, 'ob_session', sid, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_MAX_MS / 1000,
  });
  // CSRF double-submit (api-contract)
  const csrf = sessionId();
  setCookie(c, 'ob_csrf', csrf, {
    httpOnly: false,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_MAX_MS / 1000,
  });
}

export function clearSessionCookies(c: Context) {
  deleteCookie(c, 'ob_session', { path: '/' });
  deleteCookie(c, 'ob_csrf', { path: '/' });
}

export async function requireUser(c: Context): Promise<AuthedUser> {
  const sid = getCookie(c, 'ob_session');
  if (!sid) throw new ApiError('UNAUTHENTICATED');

  const sql = getSql();
  const rows = await sql<{
    id: string;
    auth_kind: 'privy' | 'seed' | 'google';
    email: string | null;
    display_name: string;
    evm_address: string | null;
    sol_address: string | null;
    referral_code: string;
    expires_at: Date;
    created_at: Date;
  }[]>`
    SELECT u.id, u.auth_kind, u.email, u.display_name, u.evm_address, u.sol_address,
           u.referral_code, s.expires_at, s.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ${sid}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new ApiError('UNAUTHENTICATED');
  const now = Date.now();
  if (row.expires_at.getTime() < now) throw new ApiError('UNAUTHENTICATED');
  if (row.created_at.getTime() + SESSION_MAX_MS < now) throw new ApiError('UNAUTHENTICATED');

  // Sliding 24h window within 7d max
  const newExpiry = new Date(Math.min(now + SESSION_SLIDE_MS, row.created_at.getTime() + SESSION_MAX_MS));
  await sql`
    UPDATE sessions SET last_seen_at = now(), expires_at = ${newExpiry} WHERE id = ${sid}
  `;

  return {
    id: row.id,
    authKind: row.auth_kind === 'google' ? 'privy' : row.auth_kind,
    email: row.email,
    displayName: row.display_name,
    evmAddress: row.evm_address,
    solAddress: row.sol_address,
    referralCode: row.referral_code,
    sessionId: sid,
  };
}

export function requireCsrf(c: Context) {
  if (c.req.method === 'GET' || c.req.method === 'HEAD') return;
  const cookie = getCookie(c, 'ob_csrf');
  const header = c.req.header('x-ob-csrf');
  if (!cookie || !header || cookie !== header) {
    throw new ApiError('UNAUTHENTICATED');
  }
}

export function assertIdempotencyKey(c: Context): string {
  const key = c.req.header('Idempotency-Key');
  if (!key) throw new ApiError('VALIDATION', { issues: [{ path: 'Idempotency-Key', message: 'required' }] });
  return key;
}

export async function withIdempotency<T>(
  userId: string,
  key: string,
  requestHash: string,
  run: () => Promise<T>,
): Promise<T> {
  const sql = getSql();
  const existing = await sql<{ response: T; request_hash: string }[]>`
    SELECT response, request_hash FROM idempotency_keys
    WHERE user_id = ${userId}::uuid AND key = ${key}
      AND created_at > now() - interval '24 hours'
    LIMIT 1
  `;
  if (existing[0]) {
    if (existing[0].request_hash !== requestHash) {
      throw new ApiError('VALIDATION', { issues: [{ message: 'Idempotency-Key reused with different body' }] });
    }
    return existing[0].response;
  }
  const response = await run();
  await sql`
    INSERT INTO idempotency_keys (user_id, key, request_hash, response, created_at)
    VALUES (${userId}::uuid, ${key}, ${requestHash}, ${sql.json(response as never)}, now())
    ON CONFLICT (user_id, key) DO NOTHING
  `;
  return response;
}

export function mePayload(u: AuthedUser, onboarded: boolean) {
  return {
    id: u.id,
    authKind: u.authKind === 'google' ? 'privy' : u.authKind,
    ...(u.email ? { email: u.email } : {}),
    displayName: u.displayName,
    ...(u.evmAddress ? { evmAddress: u.evmAddress } : {}),
    ...(u.solAddress ? { solAddress: u.solAddress } : {}),
    referralCode: u.referralCode,
    onboarded,
  };
}

export function coveredFees(amountUsd6: string) {
  return {
    totalUsd6: '0',
    pctBps: 0,
    capBps: 500,
    overCap: false,
    covered: true,
    parts: [{ label: 'Arc network', usd6: '0' }],
  };
}

export function mockEvmAction(summary: string, expectAssets: string[] = [], amounts: string[] = []) {
  return {
    kind: 'evm_calls' as const,
    chain: 'arc' as const,
    calls: [{ to: process.env.VAULT_ADDRESS || '0x0000000000000000000000000000000000000000', data: '0x', value: '0' as const }],
    summary,
    fees: coveredFees('0'),
    expect: { assets: expectAssets, amountsUsd6: amounts },
  };
}

export function failCode(code: ErrorCode, details?: Record<string, unknown>): never {
  throw new ApiError(code, details);
}
