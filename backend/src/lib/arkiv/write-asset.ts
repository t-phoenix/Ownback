import type { Hex } from 'viem';

/**
 * Upsert ownback.asset.v1 on Rabdi. Skips when keys or SDK are missing.
 * shortcut: create-only (no patchEntity lookup yet), add query+patch when tGLM + writer funded
 */
export async function writeAssetToArkiv(row: {
  assetId: string;
  chain: string;
  issuer: string;
  symbol: string;
  mint: string;
  decimals: number;
  verifiedFrom: string;
}): Promise<{ entityKey?: string; txHash?: string; skipped?: string }> {
  const accessKey = process.env.ARKIV_ACCESS_KEY;
  const pk = process.env.ARKIV_WRITER_KEY as Hex | undefined;
  if (!accessKey || !pk) return { skipped: 'ARKIV_KEYS_MISSING' };

  try {
    const { createWalletClient, ExpirationTime } = await import('@arkiv-network/sdk');
    const { rabdi } = await import('@arkiv-network/sdk/chains');
    const { u64 } = await import('@arkiv-network/sdk/schema');
    const { http } = await import('viem');
    const { privateKeyToAccount } = await import('viem/accounts');
    const { Asset } = await import('./schemas.js');

    const chain = rabdi({ accessKey });
    const walletClient = createWalletClient({
      chain,
      transport: http(),
      account: privateKeyToAccount(pk),
    });

    const { entityKey, txHash } = await walletClient.createEntity(
      Asset,
      {
        asset_id: row.assetId,
        chain: row.chain,
        issuer: row.issuer,
        symbol: row.symbol,
        mint: row.mint,
        decimals: u64(BigInt(row.decimals)),
        // Arkiv str columns are ≤128 UTF-8 bytes; full evidence stays in assets-curated.json
        verified_from: row.verifiedFrom.slice(0, 120),
      },
      { expiration: ExpirationTime.fromDays(30) },
    );
    return { entityKey, txHash };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { skipped: `arkiv_write_failed:${msg}` };
  }
}
