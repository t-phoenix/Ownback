/**
 * Deterministic resolver (D30): jury names/tickers → catalog-companies.json / catalog-tokens.json,
 * then a status per row. No AI here. Buyability comes only from assets-curated.json (verifiedMint)
 * plus a live Jupiter route (checkBuyable). Never invents an id, mint or symbol.
 */
import type { JuryRowStatus } from '../../shared/states.js';
import { listCatalogCompanies, listCatalogTokens, type CatalogCompany } from '../registry/catalog.js';
import { checkBuyable, type Buyable } from './buyable.js';
import { verifiedMint } from '../../shared/assets.js';

export type JuryRow = {
  name: string;
  ticker?: string;
  role?: string;
  why: string;
  agree: number;
  of: number;
  status: JuryRowStatus;
  assetId?: string;
  symbol?: string;
};

const SUFFIXES = new Set([
  'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'plc', 'ltd', 'limited', 'llc', 'lp',
  'holdings', 'holding', 'group', 'sa', 'nv', 'ag', 'se', 'the', 'class', 'adr', 'spa', 'kk',
]);

/** "Taiwan Semiconductor Manufacturing Co., Ltd." → "taiwan semiconductor manufacturing" */
export function normName(s: string, keepSuffixes = false): string {
  const words = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return (keepSuffixes ? words : words.filter((w) => !SUFFIXES.has(w))).join(' ');
}

/** "NASDAQ: TSM", "tsm.n" → "TSM"; "2330.TW" → "2330" */
export function normTicker(t: string): string {
  return t.toUpperCase().replace(/^[A-Z]+:\s*/, '').split(/[.\s]/)[0]!.replace(/[^A-Z0-9]/g, '');
}

const acronym = (n: string) => {
  const w = n.split(' ');
  return w.length >= 3 ? w.map((x) => x[0]).join('') : '';
};

type Index = { byTicker: Map<string, CatalogCompany>; byName: Map<string, CatalogCompany>; companies: CatalogCompany[]; commodities: CatalogCompany[] };
let index: Index | null = null;

function buildIndex(): Index {
  const all = listCatalogCompanies();
  const byId = new Map(all.map((c) => [c.assetId, c]));
  const companies = all.filter((c) => c.class === 'stock');
  const byTicker = new Map<string, CatalogCompany>();
  const byName = new Map<string, CatalogCompany>();
  for (const c of companies) {
    for (const t of [c.ticker, ...c.aliases]) if (t && !byTicker.has(t.toUpperCase())) byTicker.set(t.toUpperCase(), c);
    const n = normName(c.name);
    const prev = byName.get(n);
    // Same name twice (Unilever UL / ULVR): keep the tokenized listing for name-only lookups.
    if (n && (!prev || (!prev.tokenized && c.tokenized))) byName.set(n, c);
  }
  // Token symbols / underlying tickers point at their company too.
  for (const t of listCatalogTokens()) {
    const c = byId.get(t.assetId);
    if (!c || c.class !== 'stock') continue;
    for (const k of [t.symbol, t.underlyingTicker]) if (k && !byTicker.has(k.toUpperCase())) byTicker.set(k.toUpperCase(), c);
  }
  return { byTicker, byName, companies, commodities: all.filter((c) => c.class === 'commodity') };
}

function idx(): Index {
  return (index ??= buildIndex());
}

/** Find a listed company in the catalog. Ticker first; exact name / acronym beats a ticker that points elsewhere. */
export function findCompany(name: string, ticker?: string): CatalogCompany | undefined {
  const { byTicker, byName, companies } = idx();
  const n = normName(name);
  const nameHit = byName.get(n) ?? byName.get(acronym(normName(name, true))) ?? byName.get(acronym(n));
  const tickerHit = ticker ? byTicker.get(normTicker(ticker)) : undefined;
  // A ticker that agrees with the name picks the exact listing; a ticker that points elsewhere loses to the name.
  // Without a name match, a ticker must still share a real word with the name (or be its acronym):
  // a juror's "Cargill (CGG)" must not become whichever listed company trades as CGG.
  const words = (x: string) => normName(x).split(' ').filter((w) => w.length > 2);
  const initials = normName(name).split(' ').filter(Boolean).map((w) => w[0]).join('');
  const agrees = (c: CatalogCompany) => {
    const cn = normName(c.name).replace(/ /g, '');
    const [short, long] = initials.length <= cn.length ? [initials, cn] : [cn, initials];
    return words(c.name).some((w) => words(name).includes(w)) || (short.length >= 2 && long.startsWith(short));
  };
  if (tickerHit && (nameHit ? normName(tickerHit.name) === normName(nameHit.name) : agrees(tickerHit))) return tickerHit;
  if (nameHit) return nameHit;
  // Word-prefix match ("Amazon Web Services" → Amazon). Skipped when the juror gave a ticker we don't know:
  // "Apple Hospitality REIT (APLE)" must not become Apple.
  if (ticker || n.length < 4) return undefined;
  let best: CatalogCompany | undefined;
  let bestLen = 0;
  for (const c of companies) {
    const cn = normName(c.name);
    if (cn.length < 4) continue;
    if ((n.startsWith(`${cn} `) || cn.startsWith(`${n} `)) && cn.length > bestLen) {
      best = c;
      bestLen = cn.length;
    }
  }
  return best;
}

const COMMODITY_WORDS: Record<string, string[]> = {
  'mat:gold': ['gold'],
  'mat:silver': ['silver'],
  'mat:oil': ['oil', 'crude', 'petroleum', 'brent', 'wti', 'diesel', 'petrochemicals'],
  'mat:natgas': ['natural gas', 'lng', 'gas'],
};

/** Commodities with no catalog "commodity" row, tracked by a listed fund instead (first verified one wins). */
const COMMODITY_FUNDS: [RegExp, string[]][] = [
  [/\bcopper\b/, ['co:cper', 'co:copx']],
  [/\blithium\b/, ['co:lit']],
  [/\buranium\b/, ['co:ura']],
  [/\bplatinum\b/, ['co:pplt']],
  [/\bpalladium\b/, ['co:pall']],
  [/\brare earths?\b|\bneodymium\b|\bdysprosium\b/, ['co:remx']],
];

/** Commodity name → catalog commodity or tracking fund. Palm oil is not crude oil. */
export function findCommodity(name: string): CatalogCompany | undefined {
  const n = normName(name);
  if (/\bpalm\b|\bvegetable\b|\bcooking\b|\bessential\b|\bolive\b|\bsoy(bean)?\b|\bcoconut\b|\bsunflower\b/.test(n)) return undefined;
  for (const [re, ids] of COMMODITY_FUNDS) {
    if (!re.test(n)) continue;
    const funds = ids.map((id) => listCatalogCompanies().find((c) => c.assetId === id)).filter((c): c is CatalogCompany => !!c);
    return funds.find((c) => verifiedMint(c.assetId, 'solana')) ?? funds[0];
  }
  const { commodities } = idx();
  for (const c of commodities) {
    const words = COMMODITY_WORDS[c.assetId] ?? [normName(c.name)];
    if (words.some((w) => new RegExp(`\\b${w}\\b`).test(n))) return c;
    if (c.aliases.some((a) => a.toUpperCase() === name.trim().toUpperCase())) return c;
  }
  return undefined;
}

/** Stable identity of a row, used to count agreement and dedupe across jurors. */
export function rowKey(kind: 'company' | 'commodity', name: string, ticker?: string): string {
  const hit = kind === 'company' ? findCompany(name, ticker) : findCommodity(name);
  return hit?.assetId ?? `name:${normName(name)}`;
}

/** Status for one row. `check` is injectable for tests (default: verified mint + live Jupiter route). */
export async function resolveRow(
  kind: 'company' | 'commodity',
  row: { name: string; ticker?: string; role?: string; why: string; agree: number },
  of: number,
  check: (assetId: string) => Promise<Buyable> = checkBuyable,
): Promise<JuryRow> {
  const hit = kind === 'company' ? findCompany(row.name, row.ticker) : findCommodity(row.name);
  const base = { name: row.name, why: row.why, agree: row.agree, of, ...(row.role ? { role: row.role } : {}) };
  if (!hit) {
    const status: JuryRowStatus = kind === 'commodity' || row.ticker ? 'not_onchain' : 'private';
    // A ticker the catalog can't confirm is not shown: jurors sometimes invent one (Cargill → "CGG").
    return { ...base, status };
  }
  const named = { ...base, name: kind === 'company' ? hit.name : row.name, assetId: hit.assetId, ...(hit.ticker ? { ticker: hit.ticker } : {}) };
  const b = await check(hit.assetId);
  if (b.buyable && b.symbol) return { ...named, status: 'buyable', symbol: b.symbol };
  return { ...named, status: hit.tokenized || b.mint ? 'tokenized_unverified' : 'not_onchain' };
}

/** Test hook: drop the cached catalog index. */
export function resetResolverIndex() {
  index = null;
}
