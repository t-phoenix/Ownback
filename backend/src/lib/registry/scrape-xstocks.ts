import { randomUUID } from 'node:crypto';
import { upsertCandidate } from './store.js';
import { XSTOCKS_SYMBOL_TO_ASSET } from './symbol-map.js';
import type { AssetCandidate } from './types.js';

type Featured = {
  symbol: string;
  name: string;
  addresses?: { solana?: string; ethereum?: string };
};

export async function scrapeXstocksFeatured(fetchImpl: typeof fetch = fetch): Promise<{
  proposed: AssetCandidate[];
  skipped: string[];
}> {
  const res = await fetchImpl('https://xstocks.com/', {
    headers: { 'user-agent': 'OwnbackRegistry/0.1 (+https://github.com/ownback)' },
  });
  if (!res.ok) throw new Error(`xstocks_http_${res.status}`);
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!m?.[1]) throw new Error('xstocks_next_data_missing');
  const data = JSON.parse(m[1]) as {
    props?: { pageProps?: { featuredProducts?: Featured[] } };
  };
  const featured = data.props?.pageProps?.featuredProducts ?? [];
  const proposed: AssetCandidate[] = [];
  const skipped: string[] = [];
  const now = new Date().toISOString();
  const day = now.slice(0, 10);

  for (const p of featured) {
    const map = XSTOCKS_SYMBOL_TO_ASSET[p.symbol];
    if (!map) {
      skipped.push(p.symbol);
      continue;
    }
    const sol = p.addresses?.solana;
    if (!sol) {
      skipped.push(`${p.symbol}:no_solana`);
      continue;
    }
    const c = upsertCandidate({
      id: randomUUID(),
      assetId: map.assetId,
      name: map.name,
      class: map.class,
      chain: 'solana',
      symbol: p.symbol,
      mint: sol,
      issuer: 'xStocks',
      venues: ['jupiter'],
      source: 'scrape',
      status: 'proposed',
      createdAt: now,
      updatedAt: now,
      evidence: [
        {
          kind: 'issuer',
          url: 'https://xstocks.com/',
          note: `featuredProducts addresses.solana for ${p.symbol}`,
          checkedAt: day,
        },
      ],
    });
    proposed.push(c);
  }
  return { proposed, skipped };
}
