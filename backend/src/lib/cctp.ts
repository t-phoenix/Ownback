/**
 * CCTP V2 between Arc (domain 26) and Solana (domain 5). Program ids, account order and discriminators
 * come from scripts/smoke/idl/*_v2.json, the same path proven on mainnet in docs/tx-log.md.
 */
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { CCTP, USDC } from '../shared/chains.js';
import { ApiError } from '../shared/errors.js';
import { confirmSig, msgHash, requireRelay, solRpc } from './jupiter-swap.js';

const MT = new PublicKey(CCTP.solMessageTransmitter);
const TMM = new PublicKey(CCTP.solTokenMessengerMinter);
const SOL_USDC = new PublicKey(USDC.solana.value);
const ARC_USDC_32 = Buffer.from(USDC.arc.value.slice(2).padStart(64, '0'), 'hex');

const RECEIVE_MESSAGE = Buffer.from([38, 144, 127, 225, 31, 225, 238, 25]);
const DEPOSIT_FOR_BURN = Buffer.from([215, 60, 61, 46, 114, 55, 128, 176]);
/** TokenMessenger account: 8 disc + denylister, owner, pending_owner (3×32) + u32 + u8 → fee_recipient. */
const FEE_RECIPIENT_OFFSET = 8 + 32 * 3 + 4 + 1;

const pda = (seeds: (Buffer | Uint8Array)[], program: PublicKey) =>
  PublicKey.findProgramAddressSync(seeds.map((s) => Buffer.from(s)), program)[0];

export function hexBytes(h: string): Buffer {
  return Buffer.from(h.startsWith('0x') ? h.slice(2) : h, 'hex');
}

/** Iris V2: null until the burn is attested ("complete"). */
export async function fetchAttestation(srcDomain: number, txHash: string): Promise<{ message: string; attestation: string } | null> {
  const res = await fetch(`${CCTP.iris}/v2/messages/${srcDomain}?transactionHash=${txHash}`, {
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null);
  if (!res || res.status === 404) return null;
  if (!res.ok) throw new ApiError('UPSTREAM', { reason: 'iris', status: res.status });
  const body = (await res.json()) as { messages?: { status: string; message: string; attestation: string }[] };
  const m = body.messages?.[0];
  return m?.status === 'complete' && m.attestation?.startsWith('0x') ? { message: m.message, attestation: m.attestation } : null;
}

function borshBytes(b: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(b.length);
  return Buffer.concat([len, b]);
}

/** Mint recipient (32 bytes) inside a V2 burn message body. Header is 148 bytes; body mintRecipient at 36..68. */
export function mintRecipientOf(messageHex: string): PublicKey {
  return new PublicKey(hexBytes(messageHex).subarray(148 + 36, 148 + 68));
}

/**
 * Relay finishes an Arc→Solana transfer: USDC is minted to the message's mintRecipient (the user's own
 * USDC ATA, forced by the vault). Relay pays SOL. Idempotent: a used nonce means it already landed.
 */
export async function receiveOnSolana(messageHex: string, attestationHex: string, recipientOwner: string): Promise<string | null> {
  const relay = requireRelay();
  const c = solRpc();
  const message = hexBytes(messageHex);
  const nonce = message.subarray(12, 44);
  const usedNonce = pda([Buffer.from('used_nonce'), nonce], MT);
  if (await c.getAccountInfo(usedNonce)) return null;

  const owner = new PublicKey(recipientOwner);
  const recipientAta = getAssociatedTokenAddressSync(SOL_USDC, owner, false, TOKEN_PROGRAM_ID);
  if (!mintRecipientOf(messageHex).equals(recipientAta)) {
    throw new ApiError('NO_SOLANA_RECIPIENT', { reason: 'mint_recipient_mismatch' });
  }

  // receiveMessage alone is ~1226 bytes (under the 1232 cap). Bundling ATA create overflows
  // ("encoding overruns Uint8Array") and the worker retries forever with USDC stuck in CCTP.
  if (!(await c.getAccountInfo(recipientAta))) {
    const { blockhash: bh } = await c.getLatestBlockhash();
    const create = new VersionedTransaction(
      new TransactionMessage({
        payerKey: relay.publicKey,
        recentBlockhash: bh,
        instructions: [
          createAssociatedTokenAccountIdempotentInstruction(relay.publicKey, recipientAta, owner, SOL_USDC, TOKEN_PROGRAM_ID),
        ],
      }).compileToV0Message(),
    );
    create.sign([relay]);
    await confirmSig(await c.sendRawTransaction(create.serialize(), { skipPreflight: false, maxRetries: 3 }));
  }

  const tmInfo = await c.getAccountInfo(pda([Buffer.from('token_messenger')], TMM));
  if (!tmInfo) throw new ApiError('UPSTREAM', { reason: 'token_messenger_missing' });
  const feeRecipient = new PublicKey(tmInfo.data.subarray(FEE_RECIPIENT_OFFSET, FEE_RECIPIENT_OFFSET + 32));
  const keys = receiveMessageKeys(relay.publicKey, nonce, recipientAta, feeRecipient);
  const data = Buffer.concat([RECEIVE_MESSAGE, borshBytes(message), borshBytes(hexBytes(attestationHex))]);
  const { blockhash } = await c.getLatestBlockhash();
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: relay.publicKey,
      recentBlockhash: blockhash,
      instructions: [new TransactionInstruction({ programId: MT, keys, data })],
    }).compileToV0Message(),
  );
  tx.sign([relay]);
  const sig = await c.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await confirmSig(sig);
  return sig;
}

/** Account list for MessageTransmitterV2.receive_message + TokenMessengerMinterV2 remaining accounts (Arc → Solana). */
export function receiveMessageKeys(payer: PublicKey, nonce: Buffer, recipientAta: PublicKey, feeRecipient: PublicKey) {
  const domain = Buffer.from(String(CCTP.arcDomain));
  const usedNonce = pda([Buffer.from('used_nonce'), nonce], MT);
  const tokenMessenger = pda([Buffer.from('token_messenger')], TMM);
  return [
    { pubkey: payer, isSigner: true, isWritable: true }, // payer
    { pubkey: payer, isSigner: true, isWritable: false }, // caller
    { pubkey: pda([Buffer.from('message_transmitter_authority'), TMM.toBuffer()], MT), isSigner: false, isWritable: false },
    { pubkey: pda([Buffer.from('message_transmitter')], MT), isSigner: false, isWritable: false },
    { pubkey: usedNonce, isSigner: false, isWritable: true },
    { pubkey: TMM, isSigner: false, isWritable: false }, // receiver
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: pda([Buffer.from('__event_authority')], MT), isSigner: false, isWritable: false },
    { pubkey: MT, isSigner: false, isWritable: false },
    // remaining accounts for TokenMessengerMinter.handle_receive_*
    { pubkey: tokenMessenger, isSigner: false, isWritable: false },
    { pubkey: pda([Buffer.from('remote_token_messenger'), domain], TMM), isSigner: false, isWritable: false },
    { pubkey: pda([Buffer.from('token_minter')], TMM), isSigner: false, isWritable: true },
    { pubkey: pda([Buffer.from('local_token'), SOL_USDC.toBuffer()], TMM), isSigner: false, isWritable: true },
    { pubkey: pda([Buffer.from('token_pair'), domain, ARC_USDC_32], TMM), isSigner: false, isWritable: false },
    { pubkey: getAssociatedTokenAddressSync(SOL_USDC, feeRecipient, true), isSigner: false, isWritable: true },
    { pubkey: recipientAta, isSigner: false, isWritable: true },
    { pubkey: pda([Buffer.from('custody'), SOL_USDC.toBuffer()], TMM), isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: pda([Buffer.from('__event_authority')], TMM), isSigner: false, isWritable: false },
    { pubkey: TMM, isSigner: false, isWritable: false },
  ];
}

/**
 * Solana→Arc ("Move to Arc"): the user burns their own Solana USDC to their own Arc address.
 * Relay pays SOL and rent for the event account; returns a tx that still needs the user's signature.
 */
export async function buildSolanaBurnToArc(owner: string, arcAddress: string, amountRaw: bigint) {
  const relay = requireRelay();
  const c = solRpc();
  const eventData = Keypair.generate();
  const ix = burnToArcInstruction(new PublicKey(owner), relay.publicKey, eventData.publicKey, arcAddress, amountRaw);
  const { blockhash } = await c.getLatestBlockhash();
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: relay.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message(),
  );
  tx.sign([relay, eventData]);
  return { txBase64: Buffer.from(tx.serialize()).toString('base64'), msgHash: msgHash(tx), feePayer: relay.publicKey.toBase58() };
}

/** TokenMessengerMinterV2.deposit_for_burn: owner burns its Solana USDC to `arcAddress` on Arc (standard finality, no fee). */
export function burnToArcInstruction(user: PublicKey, payer: PublicKey, eventData: PublicKey, arcAddress: string, amountRaw: bigint) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(arcAddress)) throw new ApiError('VALIDATION', { reason: 'bad_arc_address' });
  const domain = Buffer.from(String(CCTP.arcDomain));
  const params = Buffer.alloc(8 + 4 + 32 + 32 + 8 + 4);
  params.writeBigUInt64LE(amountRaw, 0);
  params.writeUInt32LE(CCTP.arcDomain, 8);
  hexBytes(arcAddress).copy(params, 12 + 12); // mint_recipient: address left-padded to 32 bytes
  // destination_caller (44..76) stays zero: anyone may relay. max_fee (76..84) = 0.
  params.writeUInt32LE(2000, 84); // min_finality_threshold: standard
  const keys = [
    { pubkey: user, isSigner: true, isWritable: false }, // owner
    { pubkey: payer, isSigner: true, isWritable: true }, // event_rent_payer
    { pubkey: pda([Buffer.from('sender_authority')], TMM), isSigner: false, isWritable: false },
    { pubkey: getAssociatedTokenAddressSync(SOL_USDC, user, false, TOKEN_PROGRAM_ID), isSigner: false, isWritable: true },
    { pubkey: pda([Buffer.from('denylist_account'), user.toBuffer()], TMM), isSigner: false, isWritable: false },
    { pubkey: pda([Buffer.from('message_transmitter')], MT), isSigner: false, isWritable: true },
    { pubkey: pda([Buffer.from('token_messenger')], TMM), isSigner: false, isWritable: false },
    { pubkey: pda([Buffer.from('remote_token_messenger'), domain], TMM), isSigner: false, isWritable: false },
    { pubkey: pda([Buffer.from('token_minter')], TMM), isSigner: false, isWritable: false },
    { pubkey: pda([Buffer.from('local_token'), SOL_USDC.toBuffer()], TMM), isSigner: false, isWritable: true },
    { pubkey: SOL_USDC, isSigner: false, isWritable: true },
    { pubkey: eventData, isSigner: true, isWritable: true },
    { pubkey: MT, isSigner: false, isWritable: false },
    { pubkey: TMM, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: pda([Buffer.from('__event_authority')], TMM), isSigner: false, isWritable: false },
    { pubkey: TMM, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({ programId: TMM, keys, data: Buffer.concat([DEPOSIT_FOR_BURN, params]) });
}
