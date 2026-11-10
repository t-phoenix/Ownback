/**
 * Fill `icon` on verified Solana mint rows in database/registry/assets-curated.json
 * from Jupiter's token list (for xStocks it points at the issuer's own metadata host).
 * Only an exact mint match with an https URL is kept; nothing is guessed. Re-run after promoting new assets.
 *
 *   npx tsx scripts/registry-icons.ts          # fill missing icons
 *   npx tsx scripts/registry-icons.ts --all    # refresh every icon
 */
import { loadCurated, saveCurated } from '../src/lib/registry/store.js';

const SEARCH = 'https://lite-api.jup.ag/tokens/v2/search?query=';
const BATCH = 100;

async function fetchIcons(mints: string[]): Promise<Map<string, string>> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(SEARCH + mints.join(','));
    if (res.status === 429) { await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`jupiter tokens ${res.status}`);
    const rows = (await res.json()) as { id?: string; icon?: string }[];
    const want = new Set(mints);
    const out = new Map<string, string>();
    for (const r of rows) {
      if (r.id && want.has(r.id) && typeof r.icon === 'string' && /^https:\/\/[^\s"'<>]+$/.test(r.icon)) out.set(r.id, r.icon);
    }
    return out;
  }
  throw new Error('jupiter tokens: rate limited');
}

const all = process.argv.includes('--all');
const file = loadCurated();
const rows = file.assets.flatMap(a => a.mints).filter(m => m.chain === 'solana' && m.verified && (all || !m.icon));
let found = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  const icons = await fetchIcons(chunk.map(m => m.mint));
  for (const m of chunk) {
    const icon = icons.get(m.mint);
    if (icon) { m.icon = icon; found++; }
  }
  console.log(`${Math.min(i + BATCH, rows.length)}/${rows.length} checked, ${found} icons`);
  await new Promise(r => setTimeout(r, 400));
}
saveCurated(file);
console.log(`done: ${found} of ${rows.length} mints now have an icon`);
