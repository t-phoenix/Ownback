import { describe, expect, it } from 'vitest';
import { base58Decode } from '../src/lib/seed-verify.js';
import {
  associatedTokenAddress,
  buyDestinationAta,
  TOKEN_2022_PROGRAM_ID,
  usdcAtaBytes32,
  usdcAtaForSolAddress,
} from '../src/lib/solana-ata.js';

/** Smoke Solana wallet from tx-log (owner, not an ATA). */
const OWNER = '6yMWiXkXPY6AMcyZdqBK1PoBCTniLgRd89oRN67gC9bH';
const USDC_ATA = '7dq67JqMaKpcswZyPBsj568Sfe24GL2UmNFLrURs1BrC';
const AAPLX = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
const AAPLX_ATA_2022 = 'EbC8SMEadnMKvbWwYzNj61gUuMQ8N8Uavfb85Q2aXks6';
/** Classic Tokenkeg ATA — wrong for AAPLx (Token-2022). */
const AAPLX_ATA_CLASSIC = 'AdEeiuPvNc8TRUViDbynNAk7L1HWv8Z4g1n791m3Hwcv';

describe('solana ATA derivation (D28)', () => {
  it('derives USDC ATA from solAddress for vault solanaRecipient', () => {
    expect(usdcAtaForSolAddress(OWNER)).toBe(USDC_ATA);
    expect(usdcAtaBytes32(OWNER)).toBe(`0x${Buffer.from(base58Decode(USDC_ATA)).toString('hex')}`);
  });

  it('derives Token-2022 AAPLx ATA for Jupiter destination (not classic AdEeiu)', () => {
    expect(buyDestinationAta(OWNER, AAPLX, TOKEN_2022_PROGRAM_ID)).toBe(AAPLX_ATA_2022);
    expect(associatedTokenAddress(OWNER, AAPLX)).toBe(AAPLX_ATA_CLASSIC);
    expect(AAPLX_ATA_2022).not.toBe(AAPLX_ATA_CLASSIC);
  });

  it('does not treat classic AAPLx ATA string as the smoke user USDC ATA', () => {
    expect(usdcAtaForSolAddress(AAPLX_ATA_CLASSIC)).not.toBe(USDC_ATA);
  });
});
