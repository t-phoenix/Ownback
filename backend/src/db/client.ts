import postgres, { type Sql } from 'postgres';

let sql: Sql | null = null;

/** Bind bigint money columns as digit strings (postgres.js + TS). */
export function u6(n: bigint): string {
  return n.toString();
}

export function getSql(): Sql {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required');
    // Neon pooler drops idle TLS; short idle + lifetime so CONNECT_TIMEOUT doesn't wedge the pool.
    // Small default pool: local + pooler don't need 10 sockets (RAM); override with DB_POOL_MAX.
    const max = Math.max(1, Number(process.env.DB_POOL_MAX ?? 3) || 3);
    sql = postgres(url, {
      max,
      connect_timeout: 15,
      idle_timeout: 20,
      max_lifetime: 60 * 5,
    });
  }
  return sql;
}

export async function closeDb() {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
  }
}
