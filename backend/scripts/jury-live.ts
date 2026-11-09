/**
 * Run the D30 jury live on 0G (no DB, no ai_runs rows) and print the resolved verdict.
 *   cd backend && npx tsx --env-file=.env scripts/jury-live.ts "iPhone 17 Pro|Apple" "Dove soap|Dove"
 */
import { runJury, type ProductInput } from '../src/lib/match/jury.js';
import { resolveRow } from '../src/lib/match/resolve.js';

const args = process.argv.slice(2);
const products: ProductInput[] = (args.length ? args : ['iPhone 17 Pro|Apple', 'Dove beauty bar soap|Dove', 'AWS cloud services|Amazon Web Services', 'Render web hosting|Render']).map((a) => {
  const [name, brand] = a.split('|');
  return { name: name!, brand: brand ?? null };
});

const line = (r: { name: string; ticker?: string; agree: number; of: number; status: string; symbol?: string; why: string; role?: string }) =>
  `  - ${r.name}${r.ticker ? ` (${r.ticker})` : ''}${r.role ? ` · ${r.role}` : ''} · ${r.agree}/${r.of} · ${r.status === 'buyable' ? `Buy on Solana · ${r.symbol}` : r.status}\n      ${r.why}`;

for (const p of products) {
  const t0 = Date.now();
  try {
    const run = await runJury(null, p);
    const of = run.jurors.filter((j) => j.ok).length || 1;
    const parent = run.parent ? await resolveRow('company', run.parent, of) : null;
    const enablers = await Promise.all(run.enablers.map((r) => resolveRow('company', r, of)));
    const commodities = await Promise.all(run.commodities.map((r) => resolveRow('commodity', r, of)));
    console.log(`\n## ${p.name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    console.log(`understand: ${JSON.stringify(run.understanding)}`);
    console.log(`jurors: ${run.jurors.map((j) => `${j.model}${j.ok ? '' : ' ✗'}`).join(', ')}`);
    console.log(`og request ids: ${run.requestIds.join(', ')}`);
    console.log('Parent company'); if (parent) console.log(line(parent));
    console.log('Top 5 companies that help build it'); enablers.forEach((r) => console.log(line(r)));
    console.log('Top 3 commodities'); commodities.forEach((r) => console.log(line(r)));
  } catch (e) {
    console.log(`\n## ${p.name}: FAILED ${(e as Error).message}`);
  }
}
