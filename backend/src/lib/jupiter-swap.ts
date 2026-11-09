/**
 * Solana side of buys and sells (D26, D29). The user owns the input tokens and signs; the relay is only
 * the fee payer (gas + ATA rent) and co-signs. Tokens never pass through the relay.
 */
import { createHash } from 'node:crypto';
import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { ApiError } from '../shared/errors.js';
import { jupiterBuildSwap, jupiterQuote, type JupiterQuote } from './jupiter-price.js';

export function loadRelay(): Keypair | null {
  const raw = process.env.RELAY_SOL_KEY;
  if (!raw) return null;
  try {
    if (raw.startsWith('[')) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === 64) return Keypair.fromSecretKey(buf);
    const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
    if (/^[0-9a-fA-F]{128}$/.test(hex)) return Keypair.fromSecretKey(Uint8Array.from(Buffer.from(hex, 'hex')));
  } catch {
    return null;
  }
  return null;
}

export function relayConfigured(): boolean {
  return !!loadRelay();
}

export function requireRelay(): Keypair {
  const k = loadRelay();
  if (!k) throw new ApiError('KEEPER_DISABLED', { reason: 'relay_not_configured' });
  return k;
}

let conn: Connection | null = null;
export function solRpc(): Connection {
  if (!conn) conn = new Connection(process.env.RPC_SOLANA || 'https://api.mainnet-beta.solana.com', 'confirmed');
  return conn;
}

const programCache = new Map<string, PublicKey>();
/** Token program that owns the mint (xStocks are Token-2022). Read on-chain, never assumed. */
export async function tokenProgramOf(mint: string): Promise<PublicKey> {
  const hit = programCache.get(mint);
  if (hit) return hit;
  const info = await solRpc().getAccountInfo(new PublicKey(mint));
  if (!info) throw new ApiError('UPSTREAM', { reason: 'mint_not_found', mint });
  const p = info.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  programCache.set(mint, p);
  return p;
}

/** Raw balance of owner's ATA for mint; 0 if the account doesn't exist. */
export async function tokenBalanceRaw(owner: string, mint: string): Promise<bigint> {
  const program = await tokenProgramOf(mint);
  const ata = getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(owner), false, program);
  const bal = await solRpc().getTokenAccountBalance(ata).catch(() => null);
  return BigInt(bal?.value.amount ?? '0');
}

export function msgHash(tx: VersionedTransaction): string {
  return createHash('sha256').update(tx.message.serialize()).digest('hex');
}

export type BuiltSwap = { txBase64: string; msgHash: string; feePayer: string; quote: JupiterQuote };

/** Create the owner's ATA for `mint` if missing. Relay pays rent. Needed for Token-2022 (AAPLx) before Jupiter. */
export async function ensureAta(owner: string, mint: string): Promise<string> {
  const relay = requireRelay();
  const c = solRpc();
  const program = await tokenProgramOf(mint);
  const ownerPk = new PublicKey(owner);
  const mintPk = new PublicKey(mint);
  const ata = getAssociatedTokenAddressSync(mintPk, ownerPk, false, program);
  if (await c.getAccountInfo(ata)) return ata.toBase58();
  const { blockhash } = await c.getLatestBlockhash();
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: relay.publicKey,
      recentBlockhash: blockhash,
      instructions: [createAssociatedTokenAccountIdempotentInstruction(relay.publicKey, ata, ownerPk, mintPk, program)],
    }).compileToV0Message(),
  );
  tx.sign([relay]);
  await confirmSig(await c.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 }));
  return ata.toBase58();
}

/**
 * Jupiter swap where `owner` spends its own `inputMint`. Relay is fee payer and signs first;
 * the returned tx still needs the owner's signature (Privy).
 */
export async function buildUserSwap(opts: {
  owner: string;
  inputMint: string;
  outputMint: string;
  amountRaw: bigint;
  slippageBps?: number;
}): Promise<BuiltSwap> {
  const relay = requireRelay();
  const quote = await jupiterQuote({ ...opts, slippageBps: opts.slippageBps ?? 100 });
  if (!quote) throw new ApiError('UPSTREAM', { reason: 'no_route' });
  // Pre-create the Token-2022 ATA; Jupiter's create-ATA ix often sims as InvalidTokenAccount (0x1789).
  const destinationTokenAccount = await ensureAta(opts.owner, opts.outputMint);
  const b64 = await jupiterBuildSwap({
    quoteResponse: quote.raw,
    userPublicKey: opts.owner,
    payer: relay.publicKey.toBase58(),
    destinationTokenAccount,
  });
  if (!b64) throw new ApiError('UPSTREAM', { reason: 'swap_build_failed' });
  const tx = VersionedTransaction.deserialize(Buffer.from(b64, 'base64'));
  // Relay only signs a tx where it is fee payer and the owner is the only other signer.
  const n = tx.message.header.numRequiredSignatures;
  const signers = tx.message.staticAccountKeys.slice(0, n).map((k) => k.toBase58());
  if (signers[0] !== relay.publicKey.toBase58() || n !== 2 || signers[1] !== opts.owner) {
    throw new ApiError('UPSTREAM', { reason: 'unexpected_signers', signers });
  }
  tx.sign([relay]);
  return {
    txBase64: Buffer.from(tx.serialize()).toString('base64'),
    msgHash: msgHash(tx),
    feePayer: relay.publicKey.toBase58(),
    quote,
  };
}

/** Poll statuses (HTTP RPCs have no signatureSubscribe). */
export async function confirmSig(sig: string, tries = 60): Promise<void> {
  const c = solRpc();
  for (let i = 0; i < tries; i++) {
    const st = await c.getSignatureStatuses([sig], { searchTransactionHistory: true });
    const v = st.value[0];
    if (v?.err) throw new ApiError('TX_REVERTED', { chain: 'solana', sig, err: JSON.stringify(v.err) });
    if (v?.confirmationStatus === 'confirmed' || v?.confirmationStatus === 'finalized') return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new ApiError('TX_NOT_FOUND', { chain: 'solana', sig });
}

/** Accept the user-signed tx only if it is the exact message we built, then send and confirm it. */
export async function submitSigned(signedBase64: string, expectedHash: string): Promise<string> {
  let tx: VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(Buffer.from(signedBase64, 'base64'));
  } catch {
    throw new ApiError('BAD_SIGNATURE');
  }
  if (msgHash(tx) !== expectedHash) throw new ApiError('BAD_SIGNATURE', { reason: 'message_changed' });
  if (tx.signatures.some((s) => s.every((b) => b === 0))) throw new ApiError('BAD_SIGNATURE', { reason: 'missing_signature' });
  const raw = tx.serialize();
  const sig = await solRpc().sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 });
  await confirmSig(sig);
  return sig;
}

/** Owner's balance change for a mint inside a confirmed tx (raw units). Real fill, not the quote. */
export async function tokenDeltaInTx(sig: string, owner: string, mint: string): Promise<bigint> {
  for (let i = 0; i < 10; i++) {
    const t = await solRpc().getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
    if (t?.meta) {
      const pick = (arr: typeof t.meta.preTokenBalances) =>
        BigInt(arr?.find((b) => b.owner === owner && b.mint === mint)?.uiTokenAmount.amount ?? '0');
      return pick(t.meta.postTokenBalances) - pick(t.meta.preTokenBalances);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new ApiError('TX_NOT_FOUND', { chain: 'solana', sig });
}
