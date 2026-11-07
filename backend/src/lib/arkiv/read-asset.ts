import type { Hex } from 'viem';
import { verifiedMint } from '../../shared/assets.js';

export type ArkivAssetProof = { key: string; url: string };

const EXPLORER = 'https://rabdi.explorer.arkiv.network/entity/';
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; v: ArkivAssetProof | null }>();

/**
 * Reads ownback.asset.v1 for (assetId, chain) from Arkiv. Trusted only when created AND owned by our
 * writer (A1) and its mint equals our curated verified mint. Any failure → null (review still works).
 */
export async function readAssetFromArkiv(assetId: string, chain: string): Promise<ArkivAssetProof | null> {
  const writer = process.env.ARKIV_WRITER_ADDRESS as Hex | undefined;
  const expected = verifiedMint(assetId, chain);
  if (!writer || !expected) return null;

  const id = `${assetId}|${chain}`;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v;

  let v: ArkivAssetProof | null = null;
  try {
    const { createPublicClient } = await import('@arkiv-network/sdk');
    const { rabdi } = await import('@arkiv-network/sdk/chains');
    const { and, eq } = await import('@arkiv-network/sdk/query');
    const { http } = await import('viem');
    const { Asset } = await import('./schemas.js');

    const client = createPublicClient({
      chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? '' }),
      transport: http(undefined, { timeout: 4_000 }),
    });
    const res = await client
      .select({ $key: true, mint: true })
      .from(Asset)
      .where(and(eq('asset_id', assetId), eq('chain', chain)))
      .createdBy(writer)
      .ownedBy(writer)
      .limit(10)
      .fetch();
    v = pickMatching(res.entities as unknown as readonly ArkivRow[], expected.mint);
  } catch {
    v = null;
  }
  cache.set(id, { at: Date.now(), v });
  return v;
}

// SDK 1.0.1 returns typed columns as { type, value }
type ArkivRow = { $key?: string; mint?: { value?: unknown } | string };

/** The first entity whose mint matches the curated mint exactly; anything else is ignored. */
export function pickMatching(entities: readonly ArkivRow[], mint: string): ArkivAssetProof | null {
  const e = entities.find((x) => x.$key && (typeof x.mint === 'object' ? x.mint?.value : x.mint) === mint);
  return e?.$key ? { key: e.$key, url: EXPLORER + e.$key } : null;
}
