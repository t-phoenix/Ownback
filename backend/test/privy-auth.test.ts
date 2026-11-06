import { describe, expect, it } from 'vitest';
import { resolvePrivyIdentity } from '../src/lib/privy.js';

describe('resolvePrivyIdentity (MOCK_CHAIN)', () => {
  it('derives stable did + EVM + Solana addresses', async () => {
    process.env.MOCK_CHAIN = '1';
    const a = await resolvePrivyIdentity('token-a');
    const b = await resolvePrivyIdentity('token-a');
    expect(a.did).toBe(b.did);
    expect(a.evmAddress).toMatch(/^0x[a-f0-9]{40}$/);
    expect(a.solAddress?.length).toBeGreaterThanOrEqual(32);
    const c = await resolvePrivyIdentity('token-b');
    expect(c.did).not.toBe(a.did);
  });
});
