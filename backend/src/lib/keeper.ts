import { createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ApiError } from '../shared/errors.js';
import { envFlag, mockChain } from './env.js';

/** Arc mainnet — matches docs/AI_BUILD (chain id 5042). */
export const arcChain = {
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.RPC_ARC || 'https://rpc.mainnet.arc.io'] },
  },
} as const;

export function keeperEnabled(): boolean {
  return envFlag('KEEPER_ENABLED', false);
}

export function autoAddEvmEnabled(): boolean {
  return envFlag('AUTO_ADD_EVM', false);
}

/** Keeper EOA from KEEPER_PRIVATE_KEY (Q9 — not Circle developer wallets). */
export function getKeeperAccount() {
  const key = process.env.KEEPER_PRIVATE_KEY;
  if (!key) {
    if (mockChain()) return null;
    throw new ApiError('UPSTREAM');
  }
  const normalized = (key.startsWith('0x') ? key : `0x${key}`) as Hex;
  return privateKeyToAccount(normalized);
}

export function getKeeperWalletClient() {
  const account = getKeeperAccount();
  if (!account) return null;
  return createWalletClient({
    account,
    chain: arcChain,
    transport: http(arcChain.rpcUrls.default.http[0]),
  });
}

/** Solana buy relay must stay funded (D26). Returns null if unset. */
export function relaySolAddress(): string | null {
  return process.env.RELAY_SOL_ADDRESS || null;
}

export function relaySolLowBalanceThreshold(): number {
  return 0.05;
}
