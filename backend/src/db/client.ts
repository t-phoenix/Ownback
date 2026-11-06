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
    sql = postgres(url, { max: 10 });
  }
  return sql;
}

export async function closeDb() {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
  }
}
