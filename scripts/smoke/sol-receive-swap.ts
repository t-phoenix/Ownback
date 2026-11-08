/**
 * After Arc execute: Iris attestation → Solana receiveMessage → Jupiter USDC→AAPLx to user.
 *
 *   cd scripts/smoke && npx tsx sol-receive-swap.ts
 *
 * Env (from backend/.env): RPC_SOLANA, RELAY_SOL_KEY (base64 64-byte secret),
 * optional MESSAGE/ATTESTATION hex or reads /tmp/cctp-*.hex
 */
import * as anchor from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MSG_TX = process.env.MESSAGE_TRANSMITTER_V2 ?? 'CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC';
const TMM_V2 = process.env.TOKEN_MESSENGER_MINTER_V2 ?? 'CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe';
const SOL_USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const AAPLX = new PublicKey('XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp');
// Identity = Solana wallet (Privy-linked). RWA ATAs are derived, never stored as identity.
const USER = new PublicKey(
  process.env.SMOKE_SOL_USER ?? '6yMWiXkXPY6AMcyZdqBK1PoBCTniLgRd89oRN67gC9bH',
);
const RELAY_ATA = new PublicKey('6bB9KnYLG6gbmMZ2CdbyW4eu1YyBM3JEFXFQxmikiwqJ');
const REMOTE_DOMAIN = '26';
const REMOTE_TOKEN_HEX =
  '0000000000000000000000003600000000000000000000000000000000000000';

function findProgramAddress(
  label: string,
  programId: PublicKey,
  extra: (Buffer | PublicKey)[] = [],
) {
  const seeds = [Buffer.from(label), ...extra.map((x) => (Buffer.isBuffer(x) ? x : x.toBuffer()))];
  const [publicKey, bump] = PublicKey.findProgramAddressSync(seeds, programId);
  return { publicKey, bump };
}

function hexToBytes(hex: string): Buffer {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  return Buffer.from(h, 'hex');
}

function loadRelay(): Keypair {
  const raw = process.env.RELAY_SOL_KEY;
  if (!raw) throw new Error('RELAY_SOL_KEY missing');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 64) throw new Error(`RELAY_SOL_KEY expected 64 bytes, got ${buf.length}`);
  return Keypair.fromSecretKey(buf);
}

/** Alchemy HTTP has no signatureSubscribe — poll getSignatureStatuses. */
async function confirmHttp(connection: Connection, sig: string, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const st = await connection.getSignatureStatuses([sig], { searchTransactionHistory: true });
    const v = st.value[0];
    if (v?.err) throw new Error(`tx failed: ${JSON.stringify(v.err)}`);
    if (v?.confirmationStatus === 'confirmed' || v?.confirmationStatus === 'finalized') return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`confirm timeout ${sig}`);
}

async function receiveMessage(connection: Connection, payer: Keypair, messageHex: string, attestationHex: string) {
  const idlMt = JSON.parse(fs.readFileSync(path.join(__dirname, 'idl/message_transmitter_v2.json'), 'utf8'));
  const idlTm = JSON.parse(fs.readFileSync(path.join(__dirname, 'idl/token_messenger_minter_v2.json'), 'utf8'));
  // Ensure address on IDL
  idlMt.address = MSG_TX;
  idlTm.address = TMM_V2;

  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const messageTransmitterProgram = new anchor.Program(idlMt, provider);
  const tokenMessengerMinterProgram = new anchor.Program(idlTm, provider);

  const mtId = messageTransmitterProgram.programId;
  const tmId = tokenMessengerMinterProgram.programId;

  const nonce = hexToBytes(messageHex).subarray(12, 44);

  const tokenMessengerAccount = findProgramAddress('token_messenger', tmId);
  const messageTransmitterAccount = findProgramAddress('message_transmitter', mtId);
  const tokenMinterAccount = findProgramAddress('token_minter', tmId);
  const localToken = findProgramAddress('local_token', tmId, [SOL_USDC]);
  const remoteTokenKey = new PublicKey(hexToBytes(REMOTE_TOKEN_HEX));
  const custodyTokenAccount = findProgramAddress('custody', tmId, [SOL_USDC]);
  const authorityPda = findProgramAddress('message_transmitter_authority', mtId, [tmId]).publicKey;
  const tokenMessengerEventAuthority = findProgramAddress('__event_authority', tmId);
  const usedNonce = findProgramAddress('used_nonce', mtId, [nonce]).publicKey;

  // Circle examples pass remoteDomain as utf8 string "26"
  const remoteTokenMessenger = findProgramAddress('remote_token_messenger', tmId, [
    Buffer.from(REMOTE_DOMAIN),
  ]);
  const tokenPairStr = findProgramAddress('token_pair', tmId, [
    Buffer.from(REMOTE_DOMAIN),
    remoteTokenKey,
  ]);

  const tokenMessengerAccounts = await (tokenMessengerMinterProgram.account as any).tokenMessenger.fetch(
    tokenMessengerAccount.publicKey,
  );
  const feeRecipientTokenAccount = getAssociatedTokenAddressSync(
    SOL_USDC,
    tokenMessengerAccounts.feeRecipient,
  );

  const accountMetas = [
    { isSigner: false, isWritable: false, pubkey: tokenMessengerAccount.publicKey },
    { isSigner: false, isWritable: false, pubkey: remoteTokenMessenger.publicKey },
    { isSigner: false, isWritable: true, pubkey: tokenMinterAccount.publicKey },
    { isSigner: false, isWritable: true, pubkey: localToken.publicKey },
    { isSigner: false, isWritable: false, pubkey: tokenPairStr.publicKey },
    { isSigner: false, isWritable: true, pubkey: feeRecipientTokenAccount },
    { isSigner: false, isWritable: true, pubkey: RELAY_ATA },
    { isSigner: false, isWritable: true, pubkey: custodyTokenAccount.publicKey },
    { isSigner: false, isWritable: false, pubkey: TOKEN_PROGRAM_ID },
    { isSigner: false, isWritable: false, pubkey: tokenMessengerEventAuthority.publicKey },
    { isSigner: false, isWritable: false, pubkey: tmId },
  ];

  console.log('PDAs', {
    remoteTokenMessenger: remoteTokenMessenger.publicKey.toBase58(),
    tokenPair: tokenPairStr.publicKey.toBase58(),
    usedNonce: usedNonce.toBase58(),
    feeRecipient: feeRecipientTokenAccount.toBase58(),
  });

  const builder = messageTransmitterProgram.methods
    .receiveMessage({
      message: hexToBytes(messageHex),
      attestation: hexToBytes(attestationHex),
    })
    .accounts({
      payer: payer.publicKey,
      caller: payer.publicKey,
      authorityPda,
      messageTransmitter: messageTransmitterAccount.publicKey,
      usedNonce,
      receiver: tmId,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(accountMetas);
  const sig = await builder.rpc({ commitment: 'processed', skipPreflight: false });
  await confirmHttp(connection, sig);
  return sig;
}

async function jupiterSwap(connection: Connection, payer: Keypair, amount: number) {
  // Derive at swap time (Token-2022 mint → Tokenz program in ATA seeds)
  const userAaplxAta = getAssociatedTokenAddressSync(AAPLX, USER, false, TOKEN_2022_PROGRAM_ID);
  const quoteUrl =
    `https://lite-api.jup.ag/swap/v1/quote?inputMint=${SOL_USDC.toBase58()}` +
    `&outputMint=${AAPLX.toBase58()}&amount=${amount}&slippageBps=300`;
  const quote = await (await fetch(quoteUrl)).json();
  if (!quote.outAmount) throw new Error(`quote failed: ${JSON.stringify(quote)}`);
  console.log('quote outAmount', quote.outAmount, 'impact', quote.priceImpactPct);

  const createIx = createAssociatedTokenAccountIdempotentInstruction(
    payer.publicKey,
    userAaplxAta,
    USER,
    AAPLX,
    TOKEN_2022_PROGRAM_ID,
  );
  const ataInfo = await connection.getAccountInfo(userAaplxAta);
  if (!ataInfo) {
    const { blockhash } = await connection.getLatestBlockhash();
    const msg = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: [createIx],
    }).compileToV0Message();
    const ataTx = new VersionedTransaction(msg);
    ataTx.sign([payer]);
    const ataSig = await connection.sendTransaction(ataTx, { skipPreflight: false });
    await confirmHttp(connection, ataSig);
    console.log(JSON.stringify({ step: 'createAaplxAta', sig: ataSig, ata: userAaplxAta.toBase58() }));
  }

  const swapRes = await (
    await fetch('https://lite-api.jup.ag/swap/v1/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: payer.publicKey.toBase58(),
        payer: payer.publicKey.toBase58(),
        destinationTokenAccount: userAaplxAta.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    })
  ).json();
  if (!swapRes.swapTransaction) throw new Error(`swap build failed: ${JSON.stringify(swapRes)}`);

  const swapTx = VersionedTransaction.deserialize(Buffer.from(swapRes.swapTransaction, 'base64'));
  swapTx.sign([payer]);
  const before = await connection.getBalance(payer.publicKey);
  const sig = await connection.sendTransaction(swapTx, { skipPreflight: false, maxRetries: 3 });
  await confirmHttp(connection, sig);
  const after = await connection.getBalance(payer.publicKey);
  const bal = await connection.getTokenAccountBalance(userAaplxAta).catch(() => null);
  console.log(
    JSON.stringify({
      step: 'jupiter',
      sig,
      relaySolDeltaLamports: before - after,
      solOwner: USER.toBase58(),
      userAaplxAta: userAaplxAta.toBase58(),
      aaplxBal: bal?.value,
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
    }),
  );
  return sig;
}

async function main() {
  const rpc = process.env.RPC_SOLANA || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpc, 'confirmed');
  const payer = loadRelay();
  console.log('relay', payer.publicKey.toBase58());

  const messageHex =
    process.env.CCTP_MESSAGE || fs.readFileSync('/tmp/cctp-message.hex', 'utf8').trim();
  const attestationHex =
    process.env.CCTP_ATTESTATION || fs.readFileSync('/tmp/cctp-attestation.hex', 'utf8').trim();

  const beforeSol = await connection.getBalance(payer.publicKey);
  const beforeUsdc = await connection.getTokenAccountBalance(RELAY_ATA).catch(() => null);
  console.log('pre SOL', beforeSol, 'USDC', beforeUsdc?.value);

  // Skip receive when relay already holds enough USDC (resume after Alchemy WS noise).
  const swapMax = BigInt(process.env.SMOKE_SWAP_MAX ?? '100000');
  const usdcAmt = BigInt(beforeUsdc?.value?.amount ?? '0');
  const skipReceive = process.env.SKIP_RECEIVE === '1' || usdcAmt >= swapMax;
  if (!skipReceive) {
    try {
      const recvSig = await receiveMessage(connection, payer, messageHex, attestationHex);
      const afterRecv = await connection.getBalance(payer.publicKey);
      const usdc = await connection.getTokenAccountBalance(RELAY_ATA);
      console.log(
        JSON.stringify({
          step: 'receiveMessage',
          sig: recvSig,
          relaySolDeltaLamports: beforeSol - afterRecv,
          usdc: usdc.value,
        }),
      );
    } catch (e: any) {
      console.error('receiveMessage error', e?.message || e);
      const usdc = await connection.getTokenAccountBalance(RELAY_ATA).catch(() => null);
      if (BigInt(usdc?.value?.amount ?? '0') < swapMax) throw e;
      console.log('USDC already on relay, continuing to Jupiter');
    }
  } else {
    console.log('skip receive; relay USDC', usdcAmt.toString());
  }

  const usdcNow = await connection.getTokenAccountBalance(RELAY_ATA);
  const amount = Math.min(Number(usdcNow.value.amount), Number(process.env.SMOKE_SWAP_MAX ?? usdcNow.value.amount));
  await jupiterSwap(connection, payer, amount);

  const finalSol = await connection.getBalance(payer.publicKey);
  console.log(
    JSON.stringify({
      step: 'done',
      relaySolSpentLamports: beforeSol - finalSol,
      relaySolLeft: finalSol / 1e9,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
