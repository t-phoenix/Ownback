/**
 * Solana ATA derivation for Ownback (docs/03 D28 / O7-A).
 *
 * Identity = Privy/seed `solAddress` (wallet pubkey).
 * Vault `solanaRecipient` / DB `sol_usdc_ata` = that wallet's **USDC** ATA only (CCTP).
 * Per-asset RWA ATAs (AAPLx, Token-2022, …) are derived at swap time — never stored on the vault.
 */
import { createHash } from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519';
import { USDC } from '../shared/chains.js';
import { base58Decode } from './seed-verify.js';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const SOLANA_USDC_MINT = USDC.solana.value;

export function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  let out = '';
  while (n > 0n) {
    const mod = Number(n % 58n);
    out = B58[mod]! + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out || '1';
}

function isOnCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.ExtendedPoint.fromHex(Buffer.from(bytes).toString('hex'));
    return true;
  } catch {
    return false;
  }
}

function findProgramAddress(seeds: Uint8Array[], programId: Uint8Array): Uint8Array {
  const marker = Buffer.from('ProgramDerivedAddress');
  for (let bump = 255; bump >= 0; bump--) {
    const parts = [...seeds.map((s) => Buffer.from(s)), Buffer.from([bump]), Buffer.from(programId), marker];
    const hash = createHash('sha256').update(Buffer.concat(parts)).digest();
    if (!isOnCurve(hash)) return new Uint8Array(hash);
  }
  throw new Error('unable_to_find_program_address');
}

/** Associated token account for (owner, mint) under a token program. */
export function associatedTokenAddress(
  ownerBase58: string,
  mintBase58: string,
  tokenProgramId: string = TOKEN_PROGRAM_ID,
): string {
  const owner = base58Decode(ownerBase58);
  const mint = base58Decode(mintBase58);
  const tokenProgram = base58Decode(tokenProgramId);
  const ataProgram = base58Decode(ASSOCIATED_TOKEN_PROGRAM_ID);
  if (owner.length !== 32 || mint.length !== 32) throw new Error('bad_solana_pubkey');
  const ata = findProgramAddress([owner, tokenProgram, mint], ataProgram);
  return base58Encode(ata);
}

/** USDC ATA for a user's Solana wallet — vault `solanaRecipient` / DB `sol_usdc_ata`. */
export function usdcAtaForSolAddress(solAddress: string): string {
  return associatedTokenAddress(solAddress, SOLANA_USDC_MINT, TOKEN_PROGRAM_ID);
}

/** bytes32 hex for OwnbackVault.setSolanaRecipient (pubkey bytes, not base58). */
export function usdcAtaBytes32(solAddress: string): `0x${string}` {
  const ata = usdcAtaForSolAddress(solAddress);
  return `0x${Buffer.from(base58Decode(ata)).toString('hex')}`;
}

/**
 * Destination token account for a Jupiter buy (D26).
 * Pass Token-2022 program id when the mint is Tokenz… (e.g. AAPLx).
 */
export function buyDestinationAta(
  solAddress: string,
  mintBase58: string,
  tokenProgramId: string = TOKEN_PROGRAM_ID,
): string {
  return associatedTokenAddress(solAddress, mintBase58, tokenProgramId);
}
