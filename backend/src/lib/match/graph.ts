import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCatalogCompany } from '../registry/catalog.js';
import { getAsset } from '../../shared/assets.js';

export type GraphLink = { assetId: string; why: string };

export type ProductRow = {
  keys: string[];
  category: string;
  makerHint: string | null;
  behind: GraphLink[];
  materials: GraphLink[];
};

type GraphFile = {
  products: ProductRow[];
  materialsByCategory: Record<string, GraphLink[]>;
};

let cached: GraphFile | null = null;

function load(): GraphFile {
  if (cached) return cached;
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, '../../../../database/registry/product-graph.json');
  cached = JSON.parse(readFileSync(path, 'utf8')) as GraphFile;
  return cached;
}

export function knownAsset(assetId: string): boolean {
  return !!getCatalogCompany(assetId) || !!getAsset(assetId);
}

/** Match product/brand text to a seeded product graph row. */
export function lookupProductGraph(product: string, brand: string | null): ProductRow | null {
  const hay = `${brand ?? ''} ${product}`.toLowerCase();
  const g = load();
  let best: ProductRow | null = null;
  let bestLen = 0;
  for (const p of g.products) {
    for (const key of p.keys) {
      if (hay.includes(key.toLowerCase()) && key.length > bestLen) {
        best = p;
        bestLen = key.length;
      }
    }
  }
  return best;
}

export function materialsForCategory(category: string): GraphLink[] {
  return load().materialsByCategory[category] ?? [];
}

/** Drop links whose assetId isn't in the registry (A9 — never invent). */
export function filterKnown(links: GraphLink[]): GraphLink[] {
  return links.filter((l) => knownAsset(l.assetId));
}

export function listProductGraph(): ProductRow[] {
  return load().products;
}
