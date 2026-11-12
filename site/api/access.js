// POST /api/access  { email }  →  { status: 'approved' | 'waiting' | 'none', position?, url? }
// The website's Launch-app gate. The app URL is only handed to approved emails.
import { body, send, sameOrigin } from '../lib/http.js';
import { ipKey } from '../lib/auth.js';
import { normEmail } from '../lib/valid.js';
import { allow, lookup } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'Forbidden.' });
  const email = normEmail(body(req).email);
  if (!email) return send(res, 400, { error: 'That email doesn’t look right. Check it and try again.' });
  try {
    if (!(await allow('access:' + ipKey(req), 10, 600))) {
      return send(res, 429, { error: 'Too many tries from here. Wait a few minutes and try again.' });
    }
    const r = await lookup(email);
    if (!r) return send(res, 200, { status: 'none' });
    if (r.status === 'approved') {
      return send(res, 200, { status: 'approved', url: process.env.APP_URL || 'https://app.ownback.tech' });
    }
    return send(res, 200, { status: 'waiting', position: r.position });
  } catch (e) {
    console.error('access failed', e.message);
    return send(res, 500, { error: 'We couldn’t check that just now. Try again in a minute.' });
  }
}
