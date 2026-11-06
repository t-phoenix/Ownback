import { createHash } from 'node:crypto';
import { ApiError } from '../shared/errors.js';
import { mockChain } from './env.js';

export type PrivyIdentity = {
  did: string;
  email: string | null;
  displayName: string;
  evmAddress: string | null;
  solAddress: string | null;
};

function mockIdentity(accessToken: string, extras?: {
  evmAddress?: string;
  solAddress?: string;
  email?: string;
}): PrivyIdentity {
  const dig = createHash('sha256').update(accessToken).digest('hex');
  const did = `did:privy:mock_${dig.slice(0, 24)}`;
  const evm =
    extras?.evmAddress ??
    `0x${createHash('sha256').update(did + 'evm').digest('hex').slice(0, 40)}`;
  const sol =
    extras?.solAddress ??
    createHash('sha256').update(did + 'sol').digest('base64url').slice(0, 44);
  return {
    did,
    email: extras?.email ?? null,
    displayName: extras?.email?.split('@')[0] || 'You',
    evmAddress: evm,
    solAddress: sol,
  };
}

/** Verify Privy access token → DID + linked EVM smart wallet + Solana address. */
export async function resolvePrivyIdentity(
  accessToken: string,
  extras?: { evmAddress?: string; solAddress?: string; email?: string },
): Promise<PrivyIdentity> {
  const appId = process.env.PRIVY_APP_ID || process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret || mockChain()) {
    if (!mockChain() && (!appId || !appSecret)) throw new ApiError('UPSTREAM');
    return mockIdentity(accessToken, extras);
  }

  try {
    const { PrivyClient } = await import('@privy-io/node');
    const privy = new PrivyClient({ appId, appSecret });
    const claims = await privy.utils().auth().verifyAccessToken(accessToken);
    const user = await privy.users()._get(claims.user_id);
    // shortcut: linked account shapes vary; normalize EVM + Solana addresses
    const u = user as {
      id?: string;
      email?: { address?: string } | null;
      wallet?: { address?: string };
      linked_accounts?: Array<{ type?: string; address?: string; chain_type?: string }>;
    };

    const did = u.id || claims.user_id;
    const email = u.email?.address ?? null;
    let evmAddress: string | null = u.wallet?.address ?? null;
    let solAddress: string | null = null;
    for (const a of u.linked_accounts ?? []) {
      const addr = a.address;
      if (!addr) continue;
      const chain = `${a.chain_type ?? ''} ${a.type ?? ''}`.toLowerCase();
      if (!evmAddress && (chain.includes('ethereum') || chain.includes('wallet') && addr.startsWith('0x'))) {
        if (addr.startsWith('0x')) evmAddress = addr;
      }
      if (!solAddress && chain.includes('solana') && !addr.startsWith('0x')) solAddress = addr;
      if (!evmAddress && addr.startsWith('0x')) evmAddress = addr;
      if (!solAddress && !addr.startsWith('0x') && addr.length >= 32) solAddress = addr;
    }

    return {
      did,
      email,
      displayName: email?.split('@')[0] || 'You',
      evmAddress,
      solAddress,
    };
  } catch (e) {
    console.error('privy verify failed', e);
    throw new ApiError('AUTH_INVALID');
  }
}
