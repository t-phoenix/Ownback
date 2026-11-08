/**
 * Solana Jupiter venue swap (D26): relay pays gas; tokens land in user's ATA.
 * shortcut: Arc execute + CCTP not wired (docs/03 O6) — relay must already hold USDC.
 */
import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { jupiterBuildSwap, jupiterBuyQuote, jupiterSellQuote, SOL_USDC } from './jupiter-price.js';

function loadRelay(): Keypair | null {
  const raw = process.env.RELAY_SOL_KEY;
  if (!raw) return null;
  try {
    if (raw.startsWith('[')) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === 64) return Keypair.fromSecretKey(buf);
    // hex seed
    const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length >= 64) {
      return Keypair.fromSecretKey(Uint8Array.from(Buffer.from(hex.slice(0, 128), 'hex')));
    }
  } catch {
    return null;
  }
  return null;
}

function rpc(): Connection {
  return new Connection(process.env.RPC_SOLANA || 'https://api.mainnet-beta.solana.com', 'confirmed');
}

async function detectTokenProgram(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (info?.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  return TOKEN_PROGRAM_ID;
}

async function ensureAta(
  connection: Connection,
  payer: Keypair,
  owner: PublicKey,
  mint: PublicKey,
  programId: PublicKey,
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner, false, programId);
  const existing = await connection.getAccountInfo(ata);
  if (existing) return ata;
  const ix = createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata, owner, mint, programId);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const { TransactionMessage } = await import('@solana/web3.js');
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([payer]);
  const sig = await connection.sendTransaction(tx, { skipPreflight: false });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return ata;
}

export function relayConfigured(): boolean {
  return !!loadRelay();
}

export type SwapResult = {
  venueTx: string;
  outAmountRaw: string;
  inAmountRaw: string;
  explorerUrl: string;
};

function solscan(sig: string) {
  return `https://solscan.io/tx/${sig}`;
}

/** USDC → verified RWA mint into user's wallet. */
export async function executeBuySwap(opts: {
  userSolAddress: string;
  mint: string;
  amountUsd6: bigint;
  decimals: number;
}): Promise<SwapResult> {
  const payer = loadRelay();
  if (!payer) throw new Error('relay_not_configured');
  const connection = rpc();
  const mintPk = new PublicKey(opts.mint);
  const user = new PublicKey(opts.userSolAddress);
  const programId = await detectTokenProgram(connection, mintPk);
  const destAta = await ensureAta(connection, payer, user, mintPk, programId);

  const quote = await jupiterBuyQuote(opts.mint, opts.amountUsd6, 100);
  if (!quote) throw new Error('quote_failed');

  const swapTxB64 = await jupiterBuildSwap({
    quoteResponse: quote.raw,
    userPublicKey: payer.publicKey.toBase58(),
    payer: payer.publicKey.toBase58(),
    destinationTokenAccount: destAta.toBase58(),
  });
  if (!swapTxB64) throw new Error('swap_build_failed');

  const tx = VersionedTransaction.deserialize(Buffer.from(swapTxB64, 'base64'));
  tx.sign([payer]);
  const sig = await connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return {
    venueTx: sig,
    outAmountRaw: quote.outAmount,
    inAmountRaw: quote.inAmount,
    explorerUrl: solscan(sig),
  };
}

/** Verified RWA mint → USDC into user's USDC ATA. User must hold the tokens; relay pays gas. */
export async function executeSellSwap(opts: {
  userSolAddress: string;
  mint: string;
  amountRaw: bigint;
}): Promise<SwapResult> {
  const payer = loadRelay();
  if (!payer) throw new Error('relay_not_configured');
  const connection = rpc();
  const mintPk = new PublicKey(opts.mint);
  const user = new PublicKey(opts.userSolAddress);
  const usdc = new PublicKey(SOL_USDC);
  const programId = await detectTokenProgram(connection, mintPk);
  // Destination for USDC out is the user's USDC ATA (Tokenkeg).
  const destAta = await ensureAta(connection, payer, user, usdc, TOKEN_PROGRAM_ID);

  const quote = await jupiterSellQuote(opts.mint, opts.amountRaw, 100);
  if (!quote) throw new Error('quote_failed');

  // Sell: user owns the input tokens — Jupiter userPublicKey must be the user; relay is fee payer.
  const swapTxB64 = await jupiterBuildSwap({
    quoteResponse: quote.raw,
    userPublicKey: user.toBase58(),
    payer: payer.publicKey.toBase58(),
    destinationTokenAccount: destAta.toBase58(),
  });
  if (!swapTxB64) throw new Error('swap_build_failed');

  const tx = VersionedTransaction.deserialize(Buffer.from(swapTxB64, 'base64'));
  // User must co-sign sells (token authority). Without their key we can't drain their ATA from the API.
  // shortcut: sells return an unsigned tx for the PWA to sign via Privy; buys use relay as source of USDC.
  void programId;
  void tx;
  throw new Error('sell_needs_user_signature');
}

/** Build sell swap tx (base64) for the user to sign; relay is fee payer when Jupiter supports it. */
export async function buildSellSwapTx(opts: {
  userSolAddress: string;
  mint: string;
  amountRaw: bigint;
}): Promise<{ swapTransaction: string; quoteOutAmount: string; quoteInAmount: string } | null> {
  const payer = loadRelay();
  const feePayer = payer?.publicKey.toBase58() ?? opts.userSolAddress;
  const connection = rpc();
  const mintPk = new PublicKey(opts.mint);
  const user = new PublicKey(opts.userSolAddress);
  const usdc = new PublicKey(SOL_USDC);
  // If relay available, create ATA as relay; else user creates on sign.
  let destAta: PublicKey;
  if (payer) {
    destAta = await ensureAta(connection, payer, user, usdc, TOKEN_PROGRAM_ID);
  } else {
    destAta = getAssociatedTokenAddressSync(usdc, user, false, TOKEN_PROGRAM_ID);
  }
  const quote = await jupiterSellQuote(opts.mint, opts.amountRaw, 100);
  if (!quote) return null;
  const swapTxB64 = await jupiterBuildSwap({
    quoteResponse: quote.raw,
    userPublicKey: user.toBase58(),
    payer: feePayer,
    destinationTokenAccount: destAta.toBase58(),
  });
  if (!swapTxB64) return null;
  return { swapTransaction: swapTxB64, quoteOutAmount: quote.outAmount, quoteInAmount: quote.inAmount };
}
