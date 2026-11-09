import { describe, expect, it } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { routeFeeUsd6, usdStringToUsd6, valueUsd6, rawToQty } from '../src/lib/jupiter-price.js';
import { qtyToRaw } from '../src/lib/qty.js';
import { formatUsd, largestRemainderCents } from '../src/shared/money.js';
import { burnToArcInstruction, mintRecipientOf } from '../src/lib/cctp.js';
import { usdcAtaForSolAddress } from '../src/lib/solana-ata.js';
import { pipelineError } from '../src/lib/pipeline-error.js';
import { ApiError } from '../src/shared/errors.js';

describe('money and decimals', () => {
  it('formats $1.05 as $1.05 (old deposit copy printed $1.50)', () => {
    expect(formatUsd(1_050_000n)).toBe('$1.05');
  });

  it('largest remainder stays exact in bigint', () => {
    const parts = largestRemainderCents(1_000_000n, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(1_000_000n);
    expect(parts).toEqual([340_000n, 330_000n, 330_000n]);
    const big = largestRemainderCents(9_007_199_254_740_990_000n, [70, 20, 10]);
    expect(big.reduce((a, b) => a + b, 0n)).toBe(9_007_199_254_740_990_000n);
  });

  it('AAPLx 8 decimals: raw ↔ qty round-trips', () => {
    expect(rawToQty(87_176n, 8)).toBe('0.00087176');
    expect(qtyToRaw('0.00087176', 8)).toBe(87_176n);
    expect(qtyToRaw('0.000871760000000000', 8)).toBe(87_176n); // numeric(38,18) padding
  });

  it('parses Jupiter prices including scientific notation', () => {
    expect(usdStringToUsd6('344.1347043077764')).toBe(344_134_704n);
    expect(usdStringToUsd6('1.2e-7')).toBe(0n);
    expect(usdStringToUsd6('3.4413e2')).toBe(344_130_000n);
  });

  it('route fee = spend minus value of what came out at market price', () => {
    // $1 → 0.00289354 AAPLx at $344.134704 market ≈ $0.995766 → ~0.42% cost
    const out = valueUsd6(289_354n, 8, 344_134_704n);
    expect(out).toBe(995_767n); // floor of 995767.5
    expect(routeFeeUsd6(1_000_000n, out)).toBe(4_233n);
    expect(routeFeeUsd6(1_000_000n, 1_100_000n)).toBe(0n);
  });
});

describe('pipeline errors', () => {
  it('stores short codes, not JSON dumps', () => {
    expect(pipelineError(new ApiError('UPSTREAM', { reason: 'swap_build_failed' }))).toBe('UPSTREAM:swap_build_failed');
    expect(pipelineError(new Error('RangeError: encoding overruns Uint8Array'))).toBe('UPSTREAM:tx_too_large');
    expect(pipelineError(new ApiError('INSUFFICIENT_FREE', { availableUsd6: '400000', where: 'solana' }))).toBe('INSUFFICIENT_FREE');
  });
});

describe('CCTP', () => {
  it('receiveMessage alone fits the 1232-byte tx cap; ATA create in the same tx does not', async () => {
    // Regression for minting spinner: "encoding overruns Uint8Array".
    const { TransactionInstruction, TransactionMessage, Keypair } = await import('@solana/web3.js');
    const { TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction } = await import('@solana/spl-token');
    const { receiveMessageKeys, hexBytes } = await import('../src/lib/cctp.js');
    const msg = hexBytes('0x000000010000001a0000000549c2a5fc82e64116485cee711b41c13af1b128c22bb8f1a3cc26cef3df94837400000000000000000000000028b5a0e9c621a5badaa536219b3a228c8168cf5da65fc81d0fefa8860cb3b83f089b0224be8a6687b7ae49f594c0b9b4d7e938930000000000000000000000000000000000000000000000000000000000000000000007d0000007d00000000100000000000000000000000036000000000000000000000000000000000000000dd248e8be761ef8e3a444edf3ef92b69b7ff423959eb69910bb497d7b9cd08200000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000273104299bb7795ac06ef1caac59c88e3efeb864000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000');
    const att = hexBytes('0x2e023cc9a67506df1a265917566c5b470e7e197f4ecd3232514d3ca35735ba3902b66b38f0bbfbc98c2ac396934bd4e43d9988708e26e7bda64033a7886d31ea1bef3b36125aad15f323b677fa9d5ccbb29a6ad126f81422dff2689dd6439543214759eba09ef3e3a8cdd3f247533738a0e6485066f2dfc6f70ff9fb503f27fd6d1b');
    const payer = Keypair.generate().publicKey;
    const owner = Keypair.generate().publicKey;
    const ata = new PublicKey(msg.subarray(148 + 36, 148 + 68));
    const borsh = (b: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32LE(b.length); return Buffer.concat([l, b]); };
    const recv = new TransactionInstruction({
      programId: new PublicKey('CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC'),
      keys: receiveMessageKeys(payer, msg.subarray(12, 44), ata, Keypair.generate().publicKey),
      data: Buffer.concat([Buffer.from([38, 144, 127, 225, 31, 225, 238, 25]), borsh(msg), borsh(att)]),
    });
    const create = createAssociatedTokenAccountIdempotentInstruction(
      payer, ata, owner, new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), TOKEN_PROGRAM_ID,
    );
    const bh = Keypair.generate().publicKey.toBase58();
    const alone = new TransactionMessage({ payerKey: payer, recentBlockhash: bh, instructions: [recv] }).compileToV0Message().serialize();
    expect(alone.length + 65).toBeLessThanOrEqual(1232);
    expect(() =>
      new TransactionMessage({ payerKey: payer, recentBlockhash: bh, instructions: [create, recv] }).compileToV0Message().serialize(),
    ).toThrow(/overruns|too large/i);
  });

  it('reads the mint recipient from a V2 burn message (header 148, body 36..68)', () => {
    const ata = new PublicKey(usdcAtaForSolAddress('DUjBeocZjZxPnUy7v9LSAinKmue5qr4bfaBD9ewBUG5T'));
    const msg = Buffer.alloc(148 + 228);
    ata.toBuffer().copy(msg, 148 + 36);
    expect(mintRecipientOf(`0x${msg.toString('hex')}`).equals(ata)).toBe(true);
  });

  it('Solana→Arc burn encodes amount, domain 26 and the left-padded Arc address', () => {
    const owner = new PublicKey('DUjBeocZjZxPnUy7v9LSAinKmue5qr4bfaBD9ewBUG5T');
    const ix = burnToArcInstruction(owner, owner, owner, '0xB7c86Df940FfC3CCF45c0317611d2D9Eef000448', 250_000n);
    const p = ix.data.subarray(8);
    expect(p.readBigUInt64LE(0)).toBe(250_000n);
    expect(p.readUInt32LE(8)).toBe(26);
    expect(p.subarray(12, 44).toString('hex')).toBe('000000000000000000000000b7c86df940ffc3ccf45c0317611d2d9eef000448');
    expect(p.readUInt32LE(84)).toBe(2000);
    const usdc = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(ix.keys[3]!.pubkey.equals(getAssociatedTokenAddressSync(usdc, owner))).toBe(true);
    expect(() => burnToArcInstruction(owner, owner, owner, 'nope', 1n)).toThrow();
  });
});
