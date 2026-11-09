#!/usr/bin/env node
/**
 * Apply additive SQL migrations in database/migrations/.
 * Baseline DBs that already have 0001/0002 get those marked applied without re-running.
 *
 *   cd backend && npm run db:migrate
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// No root node_modules: resolve postgres from the backend package.
const postgres = createRequire(join(root, 'backend/package.json'))('postgres');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const dir = join(root, 'database/migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

await sql`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

const hasUsers = await sql`SELECT to_regclass('public.users') AS t`;
if (hasUsers[0]?.t) {
  for (const file of ['0001_init.sql', '0002_privy_auth.sql']) {
    await sql`INSERT INTO schema_migrations (filename) VALUES (${file}) ON CONFLICT DO NOTHING`;
  }
}

for (const file of files) {
  const done = await sql`SELECT 1 FROM schema_migrations WHERE filename = ${file}`;
  if (done.length) {
    console.log('skip', file);
    continue;
  }
  const body = readFileSync(join(dir, file), 'utf8');
  console.log('apply', file);
  await sql.begin(async (tx) => {
    await tx.unsafe(body);
    await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
  });
}

await sql.end();
console.log('migrations ok');
