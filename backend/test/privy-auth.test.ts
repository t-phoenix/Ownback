import { afterEach, describe, expect, it } from 'vitest';
import { resolvePrivyIdentity } from '../src/lib/privy.js';

describe('resolvePrivyIdentity (MOCK_CHAIN)', () => {
  const saved = {
    MOCK_CHAIN: process.env.MOCK_CHAIN,
    PRIVY_APP_ID: process.env.PRIVY_APP_ID,
    PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
  };
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('derives stable did + EVM + Solana addresses', async () => {
    process.env.MOCK_CHAIN = '1';
    // Real Privy keys force JWT verify — clear them so this unit test stays offline.
    delete process.env.PRIVY_APP_ID;
    delete process.env.PRIVY_APP_SECRET;
    delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const a = await resolvePrivyIdentity('token-a');
    const b = await resolvePrivyIdentity('token-a');
    expect(a.did).toBe(b.did);
    expect(a.evmAddress).toMatch(/^0x[a-f0-9]{40}$/);
    expect(a.solAddress?.length).toBeGreaterThanOrEqual(32);
    const c = await resolvePrivyIdentity('token-b');
    expect(c.did).not.toBe(a.did);
  });
});
