/**
 * Discovery catalog (long RWA list). Loaded from database/registry/catalog-*.json.
 * Verified buys still go through assets-curated.json + Arkiv — see asset-discovery.md.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { registryDir } from './paths.js';

export type CatalogToken = {
  id: string;
  assetId: string;
  issuer: 'xStocks' | 'Ondo' | 'Hyperliquid';
  symbol: string;
  name: string;
  underlyingTicker: string | null;
  class: string;
  chain: 'solana' | 'hyperliquid';
  mint: string | null;
  market: string | null;
  status: 'candidate' | 'verified';
  swap: string;
  decimals: number | null;
};

export type CatalogCompany = {
  assetId: string;
  name: string;
  ticker: string | null;
  listed: boolean;
  class: string;
  tokenized: boolean;
  verifiedBuyable: boolean;
  aliases: string[];
  tokens: { issuer: string; symbol: string; chain: string; mint: string | null; status: string }[];
};

type CompaniesFile = { updatedAt: string; companies: CatalogCompany[] };
type TokensFile = { updatedAt: string; tokens: CatalogToken[] };
type MetaFile = {
  updatedAt: string;
  storage: Record<string, string>;
  counts: Record<string, number>;
};

let companiesCache: CompaniesFile | null = null;
let tokensCache: TokensFile | null = null;
let metaCache: MetaFile | null = null;

function readJson<T>(name: string): T | null {
  const p = join(registryDir(), name);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

export function catalogMeta(): MetaFile | null {
  if (!metaCache) metaCache = readJson('catalog-meta.json');
  return metaCache;
}

export function listCatalogCompanies(): CatalogCompany[] {
  if (!companiesCache) companiesCache = readJson('catalog-companies.json');
  return companiesCache?.companies ?? [];
}

export function listCatalogTokens(filter?: { chain?: string; issuer?: string; status?: string }): CatalogToken[] {
  if (!tokensCache) tokensCache = readJson('catalog-tokens.json');
  let rows = tokensCache?.tokens ?? [];
  if (filter?.chain) rows = rows.filter((t) => t.chain === filter.chain);
  if (filter?.issuer) rows = rows.filter((t) => t.issuer === filter.issuer);
  if (filter?.status) rows = rows.filter((t) => t.status === filter.status);
  return rows;
}

export function getCatalogCompany(assetId: string): CatalogCompany | undefined {
  return listCatalogCompanies().find((c) => c.assetId === assetId);
}

/** Lines fed to find_maker — prefer stocks/commodities/indexes, not perps. */
export function registryLinesForMaker(): string[] {
  return listCatalogCompanies()
    .filter((c) => c.class === 'stock' || c.class === 'etf' || c.class === 'commodity' || c.class === 'index')
    .map((c) => {
      const flags = [
        c.verifiedBuyable ? 'buyable' : c.tokenized ? 'tokenized_candidate' : 'listed',
        c.ticker ? `ticker=${c.ticker}` : null,
      ]
        .filter(Boolean)
        .join(',');
      return `${c.assetId} = ${c.name}${flags ? ` (${flags})` : ''}`;
    });
}

export function searchCompanies(q: string, limit = 20): CatalogCompany[] {
  const needle = q.trim().toLowerCase();
  const all = listCatalogCompanies();
  if (!needle) return all.slice(0, limit);
  return all
    .filter(
      (c) =>
        c.assetId.includes(needle) ||
        c.name.toLowerCase().includes(needle) ||
        (c.ticker && c.ticker.toLowerCase().includes(needle)) ||
        c.aliases.some((a) => a.toLowerCase().includes(needle)),
    )
    .slice(0, limit);
}
