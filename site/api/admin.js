// /api/admin — the hidden waitlist desk.
//   GET  ?action=me | list | export
//   POST { action: login, password } | { action: logout } | { action: status, id, status }
//        { action: grant, email, note? } | { action: remove, id }
import { body, send, sameOrigin, isHttps } from '../lib/http.js';
import { passwordOk, makeToken, tokenOk, cookieHeader, readCookie, ipKey } from '../lib/auth.js';
import { normEmail, cleanText, csvCell } from '../lib/valid.js';
import { allow, list, setStatus, grant, remove } from '../lib/store.js';

export default async function handler(req, res) {
  try {
    const authed = tokenOk(readCookie(req));
    if (req.method === 'GET') {
      const action = new URL(req.url, 'http://x').searchParams.get('action');
      if (action === 'me') return send(res, 200, { authed });
      if (!authed) return send(res, 401, { error: 'Sign in first.' });
      const rows = await list();
      if (action === 'export') {
        const cols = ['id', 'email', 'why', 'newsletter', 'status', 'source', 'created_at', 'approved_at'];
        const csv = [cols.join(',')].concat(rows.map((r) => cols.map((c) => csvCell(r[c] instanceof Date ? r[c].toISOString() : r[c])).join(','))).join('\n');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="ownback-waitlist.csv"');
        res.setHeader('Cache-Control', 'no-store');
        return res.end(csv);
      }
      return send(res, 200, { rows });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Use GET or POST.' });
    if (!sameOrigin(req)) return send(res, 403, { error: 'Forbidden.' });
    const b = body(req);

    if (b.action === 'login') {
      if (!(await allow('login:' + ipKey(req), 6, 900))) {
        return send(res, 429, { error: 'Too many attempts. Wait 15 minutes.' });
      }
      if (!passwordOk(b.password)) return send(res, 401, { error: 'Wrong password.' });
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(makeToken(), isHttps(req)) });
    }
    if (b.action === 'logout') return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader('', isHttps(req)) });
    if (!authed) return send(res, 401, { error: 'Sign in first.' });

    if (b.action === 'status') {
      const id = Number(b.id);
      if (!Number.isSafeInteger(id) || !['waiting', 'approved'].includes(b.status)) return send(res, 400, { error: 'Bad request.' });
      return (await setStatus(id, b.status)) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Not found.' });
    }
    if (b.action === 'grant') {
      const email = normEmail(b.email);
      if (!email) return send(res, 400, { error: 'That email doesn’t look right.' });
      await grant(email, cleanText(b.note, 500));
      return send(res, 200, { ok: true });
    }
    if (b.action === 'remove') {
      const id = Number(b.id);
      if (!Number.isSafeInteger(id)) return send(res, 400, { error: 'Bad request.' });
      return (await remove(id)) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Not found.' });
    }
    return send(res, 400, { error: 'Unknown action.' });
  } catch (e) {
    console.error('admin failed', e.message);
    return send(res, 500, { error: 'Something failed on our side. Try again.' });
  }
}
