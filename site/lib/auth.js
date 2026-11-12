// Admin session: one password from the env, a signed cookie that expires in 12 hours.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'ob_admin';
const TTL_S = 12 * 60 * 60;

function secret() {
  const s = process.env.ADMIN_SECRET;
  if (!s || s.length < 32) throw new Error('ADMIN_SECRET must be at least 32 characters');
  return s;
}

const sha = (s) => createHash('sha256').update(String(s)).digest();
const sign = (body) => createHmac('sha256', secret()).update(body).digest('base64url');

/** Constant-time password check against ADMIN_PASSWORD. */
export function passwordOk(given) {
  const want = process.env.ADMIN_PASSWORD;
  if (!want || want.length < 10 || typeof given !== 'string') return false;
  return timingSafeEqual(sha(given), sha(want));
}

export function makeToken(now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ exp: Math.floor(now / 1000) + TTL_S })).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function tokenOk(token, now = Date.now()) {
  if (typeof token !== 'string') return false;
  const [body, mac] = token.split('.');
  if (!body || !mac) return false;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()).exp > now / 1000;
  } catch {
    return false;
  }
}

export function cookieHeader(token, secure) {
  const base = `${COOKIE}=${token}; Path=/api/admin; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
  return token ? `${base}; Max-Age=${TTL_S}` : `${base}; Max-Age=0`;
}

export function readCookie(req, name = COOKIE) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/** Salted hash of the caller's IP, for rate limits only. The raw IP is never stored. */
export function ipKey(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  return createHash('sha256').update(secret() + '|' + ip).digest('base64url').slice(0, 22);
}
