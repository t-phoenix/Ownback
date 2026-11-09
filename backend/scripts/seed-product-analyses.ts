/**
 * Seed product_analyses from database/registry/product-graph.json (source='seed').
 * Seed rows are used only when the 0G jury can't answer (D30); jury rows replace them as the cache.
 *   cd backend && npx tsx --env-file=.env scripts/seed-product-analyses.ts
 */
import { closeDb } from '../src/db/client.js';
import { listProductGraph } from '../src/lib/match/graph.js';
import { graphToVerdict, putCachedVerdict } from '../src/lib/match/jury.js';
import { normName } from '../src/lib/match/resolve.js';

let n = 0;
for (const row of listProductGraph()) {
  const key = normName(row.keys[0]!, true);
  await putCachedVerdict(key, row.keys.join(', '), graphToVerdict(row), 'seed');
  n++;
}
console.log(`seeded ${n} product_analyses rows`);
await closeDb();
