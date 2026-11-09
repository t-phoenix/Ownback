import { describe, expect, it } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { routeFeeUsd6, usdStringToUsd6, valueUsd6, rawToQty } from '../src/lib/jupiter-price.js';
import { qtyToRaw } from '../src/lib/qty.js';
import { formatUsd, largestRemainderCents } from '../src/shared/money.js';
import { burnToArcInstruction, mintRecipientOf } from '../src/lib/cctp.js';
import { usdcAtaForSolAddress } from '../src/lib/solana-ata.js';

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

describe('CCTP', () => {
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
