import { describe, expect, it } from 'vitest';
import { pickMatching } from '../src/lib/arkiv/read-asset.js';

const MINT = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';

describe('pickMatching (Arkiv asset trust check)', () => {
  it('accepts an entity whose mint equals the curated mint (SDK {type,value} shape)', () => {
    const r = pickMatching([{ $key: '0xabc', mint: { value: MINT } }], MINT);
    expect(r).toEqual({ key: '0xabc', url: 'https://rabdi.explorer.arkiv.network/entity/0xabc' });
  });
  it('rejects an entity with a different mint', () => {
    expect(pickMatching([{ $key: '0xbad', mint: { value: 'EvilMint111' } }], MINT)).toBeNull();
  });
  it('skips a wrong one and picks the matching one', () => {
    const r = pickMatching([{ $key: '0xbad', mint: { value: 'x' } }, { $key: '0xgood', mint: MINT }], MINT);
    expect(r?.key).toBe('0xgood');
  });
  it('returns null for no entities', () => {
    expect(pickMatching([], MINT)).toBeNull();
  });
});
