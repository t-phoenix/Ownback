// POST /api/join  { email, why?, newsletter?, company? }  →  { position }
import { body, send, sameOrigin } from '../lib/http.js';
import { ipKey } from '../lib/auth.js';
import { normEmail, cleanText } from '../lib/valid.js';
import { allow, join } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'Forbidden.' });
  const b = body(req);
  // Honeypot: real people never fill the hidden "company" field. Pretend it worked.
  if (b.company) return send(res, 200, { position: 0 });
  const email = normEmail(b.email);
  if (!email) return send(res, 400, { error: 'That email doesn’t look right. Check it and try again.' });
  try {
    if (!(await allow('join:' + ipKey(req), 8, 600))) {
      return send(res, 429, { error: 'Too many tries from here. Wait a few minutes and try again.' });
    }
    const r = await join({ email, why: cleanText(b.why, 500), newsletter: b.newsletter === true });
    return send(res, 200, { position: r.position, status: r.status });
  } catch (e) {
    console.error('join failed', e.message);
    return send(res, 500, { error: 'We couldn’t save that just now. Try again in a minute.' });
  }
}
