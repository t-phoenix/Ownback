/** Verified ✓ values only from contracts/chain-config.md. Temporary until packages/shared. */

export const ChainKeys = ['arc', 'solana', 'base', 'ethereum', 'arbitrum', 'bnb'] as const;
export type ChainKey = (typeof ChainKeys)[number];
export type DepositChain = Exclude<ChainKey, 'bnb'>;

export const DEPOSIT_CHAINS: DepositChain[] = ['arc', 'solana', 'base', 'ethereum', 'arbitrum'];

export const ARC_CHAIN_ID = 5042;

/** USDC addresses marked ✓ in chain-config.md. */
export const USDC = {
  arc: { value: '0x3600000000000000000000000000000000000000', decimals: 6, verified: true },
  ethereum: { value: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, verified: true },
  base: { value: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, verified: true },
  arbitrum: { value: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, verified: true },
  solana: { value: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, verified: true },
} as const;

export function isDepositChain(c: string): c is DepositChain {
  return (DEPOSIT_CHAINS as string[]).includes(c);
}

/** CCTP V2, ✓ in chain-config.md. Domains: Arc 26, Solana 5. */
export const CCTP = {
  arcDomain: 26,
  solanaDomain: 5,
  arcTokenMessenger: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
  arcMessageTransmitter: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
  solMessageTransmitter: 'CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC',
  solTokenMessengerMinter: 'CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe',
  iris: 'https://iris-api.circle.com',
} as const;

/** Explorer bases, ✓ in chain-config.md. */
export const EXPLORER = {
  arcTx: (h: string) => `https://explorer.arc.io/tx/${h}`,
  solTx: (s: string) => `https://solscan.io/tx/${s}`,
} as const;
