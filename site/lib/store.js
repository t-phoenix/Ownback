// Waitlist storage. Postgres (Neon) in production; an in-memory copy only when SITE_DEV=1.
import postgres from 'postgres';

let sql = null;
let ready = null;
const mem = { rows: [], hits: [], id: 0 };

function dev() {
  if (process.env.DATABASE_URL) return false;
  if (process.env.SITE_DEV === '1') return true;
  throw new Error('DATABASE_URL is required');
}

async function db() {
  if (!sql) {
    sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10, idle_timeout: 20, prepare: false });
  }
  // Create tables on first use, so a fresh database needs no migration step.
  ready ??= sql`
    create table if not exists site_waitlist (
      id bigserial primary key,
      email text not null unique,
      why text,
      newsletter boolean not null default false,
      status text not null default 'waiting' check (status in ('waiting','approved')),
      source text not null default 'site',
      created_at timestamptz not null default now(),
      approved_at timestamptz
    )`.then(() => sql`
    create table if not exists site_rate (key text not null, at timestamptz not null default now())`)
    .then(() => sql`create index if not exists site_rate_key_at on site_rate (key, at)`)
    .catch((e) => { ready = null; throw e; });
  await ready;
  return sql;
}

/** True while `key` has made fewer than `max` calls in the last `windowS` seconds; records this call. */
export async function allow(key, max, windowS) {
  if (dev()) {
    const since = Date.now() - windowS * 1000;
    mem.hits = mem.hits.filter((h) => h.at > since);
    const n = mem.hits.filter((h) => h.key === key).length;
    mem.hits.push({ key, at: Date.now() });
    return n < max;
  }
  const s = await db();
  const [{ n }] = await s`
    select count(*)::int as n from site_rate where key = ${key} and at > now() - make_interval(secs => ${windowS})`;
  await s`insert into site_rate (key) values (${key})`;
  if (Math.random() < 0.02) await s`delete from site_rate where at < now() - interval '1 day'`;
  return n < max;
}

const pos = (rows, id) => rows.filter((r) => r.id <= id).length;

/** Add or refresh a sign-up. Returns the person's place in line. */
export async function join({ email, why, newsletter }) {
  if (dev()) {
    let r = mem.rows.find((x) => x.email === email);
    if (r) {
      r.why = why ?? r.why;
      r.newsletter = r.newsletter || newsletter;
    } else {
      r = { id: ++mem.id, email, why, newsletter, status: 'waiting', source: 'site', created_at: new Date().toISOString(), approved_at: null };
      mem.rows.push(r);
    }
    return { position: pos(mem.rows, r.id), status: r.status };
  }
  const s = await db();
  const [r] = await s`
    insert into site_waitlist (email, why, newsletter) values (${email}, ${why}, ${newsletter})
    on conflict (email) do update
      set why = coalesce(excluded.why, site_waitlist.why),
          newsletter = site_waitlist.newsletter or excluded.newsletter
    returning id, status`;
  const [{ n }] = await s`select count(*)::int as n from site_waitlist where id <= ${r.id}`;
  return { position: n, status: r.status };
}

/** Status for the Launch-app gate: null when the email never signed up. */
export async function lookup(email) {
  if (dev()) {
    const r = mem.rows.find((x) => x.email === email);
    return r ? { status: r.status, position: pos(mem.rows, r.id) } : null;
  }
  const s = await db();
  const [r] = await s`select id, status from site_waitlist where email = ${email}`;
  if (!r) return null;
  const [{ n }] = await s`select count(*)::int as n from site_waitlist where id <= ${r.id}`;
  return { status: r.status, position: n };
}

export async function list() {
  if (dev()) return [...mem.rows].sort((a, b) => b.id - a.id);
  const s = await db();
  return s`
    select id, email, why, newsletter, status, source, created_at, approved_at
    from site_waitlist order by id desc limit 5000`;
}

export async function setStatus(id, status) {
  if (dev()) {
    const r = mem.rows.find((x) => x.id === id);
    if (r) {
      r.status = status;
      r.approved_at = status === 'approved' ? new Date().toISOString() : null;
    }
    return !!r;
  }
  const s = await db();
  const rows = await s`
    update site_waitlist set status = ${status},
      approved_at = ${status === 'approved' ? s`now()` : null}
    where id = ${id} returning id`;
  return rows.length > 0;
}

/** Let someone in who never signed up (an investor, a friend). */
export async function grant(email, why) {
  if (dev()) {
    let r = mem.rows.find((x) => x.email === email);
    if (!r) {
      r = { id: ++mem.id, email, why, newsletter: false, source: 'admin', created_at: new Date().toISOString() };
      mem.rows.push(r);
    }
    r.status = 'approved';
    r.approved_at = new Date().toISOString();
    return true;
  }
  const s = await db();
  await s`
    insert into site_waitlist (email, why, status, source, approved_at)
    values (${email}, ${why}, 'approved', 'admin', now())
    on conflict (email) do update set status = 'approved', approved_at = now()`;
  return true;
}

export async function remove(id) {
  if (dev()) {
    const n = mem.rows.length;
    mem.rows = mem.rows.filter((x) => x.id !== id);
    return mem.rows.length < n;
  }
  const s = await db();
  const rows = await s`delete from site_waitlist where id = ${id} returning id`;
  return rows.length > 0;
}
