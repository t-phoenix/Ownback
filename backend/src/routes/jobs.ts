import { Hono } from 'hono';
import { getSql } from '../db/client.js';
import { ApiError } from '../shared/errors.js';
import { envFlag, requireCron } from '../lib/env.js';
import { jsonError } from '../lib/http.js';
import { newId } from '../lib/ids.js';

export const jobRoutes = new Hono();

function cronAuth(c: { req: { header: (n: string) => string | undefined } }) {
  try {
    requireCron(c.req.header('authorization'));
  } catch {
    throw new ApiError('UNAUTHENTICATED');
  }
}

jobRoutes.post('/jobs/keeper/run', async (c) => {
  try {
    cronAuth(c);
    if (!envFlag('KEEPER_ENABLED', false)) {
      return c.json({ ok: true, skipped: 'KEEPER_DISABLED' });
    }
    const sql = getSql();
    // Lock + execute path (keeper-and-jobs.md). Without chain clients, only claim lock.
    const locked = await sql<{ held_by: string | null }[]>`
      UPDATE keeper_lock SET held_by = ${`api-${process.pid}`}, held_at = now()
      WHERE id = 1 AND (held_by IS NULL OR held_at < now() - interval '2 minutes')
      RETURNING held_by
    `;
    if (!locked[0]) return c.json({ ok: true, skipped: 'busy' });
    try {
      const pending = await sql`
        SELECT id FROM buy_approvals
        WHERE status = 'signed' AND deadline > now()
        LIMIT 20
      `;
      // Real execute needs vault + venues (spikes). Do not invent buys.
      return c.json({ ok: true, pendingApprovals: pending.length });
    } finally {
      await sql`UPDATE keeper_lock SET held_by = NULL, held_at = NULL WHERE id = 1`;
    }
  } catch (e) {
    return jsonError(c, e);
  }
});

jobRoutes.post('/jobs/buy-reminder', async (c) => {
  try {
    cronAuth(c);
    const sql = getSql();
    // Reminder only — no money (Q7).
    const users = await sql<{ user_id: string }[]>`SELECT user_id FROM rules`;
    for (const u of users) {
      await sql`
        INSERT INTO events (id, user_id, kind, payload, link, created_at)
        VALUES (${newId()}::uuid, ${u.user_id}::uuid, 'buy_reminder', '{}'::jsonb, '/jars', now())
      `;
    }
    return c.json({ ok: true, reminded: users.length });
  } catch (e) {
    return jsonError(c, e);
  }
});

jobRoutes.post('/jobs/deposits/forward', async (c) => {
  try {
    cronAuth(c);
    // Forwarder + CCTP path (Q3); needs RELAYER_WALLET_IDS + verified forwarder address.
    return c.json({ ok: true, forwarded: 0 });
  } catch (e) {
    return jsonError(c, e);
  }
});

jobRoutes.post('/jobs/gmail/scan', async (c) => {
  try {
    cronAuth(c);
    if (!envFlag('GMAIL_ENABLED', false)) return c.json({ ok: true, skipped: 'GMAIL_DISABLED' });
    return c.json({ ok: true, scanned: 0 });
  } catch (e) {
    return jsonError(c, e);
  }
});

jobRoutes.post('/jobs/prices/refresh', async (c) => {
  try {
    cronAuth(c);
    // Jupiter/Pyth when S18 done; do not invent prices.
    return c.json({ ok: true, refreshed: 0 });
  } catch (e) {
    return jsonError(c, e);
  }
});

jobRoutes.post('/jobs/rest-pending', async (c) => {
  try {
    cronAuth(c);
    const sql = getSql();
    const rows = await sql<{ id: string; user_id: string; rest_usd6: bigint }[]>`
      SELECT id, user_id, rest_usd6 FROM purchases
      WHERE rest_usd6 > 0 AND status = 'saved'
    `;
    for (const r of rows) {
      await sql`
        INSERT INTO events (id, user_id, kind, payload, link, created_at)
        VALUES (
          ${newId()}::uuid, ${r.user_id}::uuid, 'rest_ready',
          ${sql.json({ purchaseId: r.id, restUsd6: r.rest_usd6.toString() })}::jsonb,
          ${`/purchases/${r.id}`}, now()
        )
      `;
    }
    return c.json({ ok: true, notified: rows.length });
  } catch (e) {
    return jsonError(c, e);
  }
});

jobRoutes.post('/jobs/arkiv/refresh', async (c) => {
  try {
    cronAuth(c);
    return c.json({ ok: true, extended: 0 });
  } catch (e) {
    return jsonError(c, e);
  }
});

jobRoutes.post('/jobs/relay/watch', async (c) => {
  try {
    cronAuth(c);
    return c.json({ ok: true, alerts: 0 });
  } catch (e) {
    return jsonError(c, e);
  }
});
