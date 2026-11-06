import { describe, expect, it } from 'vitest';
import { autoAddEvmEnabled, getKeeperAccount, keeperEnabled } from '../src/lib/keeper.js';

describe('keeper helpers (Q9)', () => {
  it('defaults AUTO_ADD_EVM and KEEPER_ENABLED off', () => {
    delete process.env.AUTO_ADD_EVM;
    delete process.env.KEEPER_ENABLED;
    expect(autoAddEvmEnabled()).toBe(false);
    expect(keeperEnabled()).toBe(false);
  });

  it('returns null keeper when mock and no key', () => {
    process.env.MOCK_CHAIN = '1';
    delete process.env.KEEPER_PRIVATE_KEY;
    expect(getKeeperAccount()).toBeNull();
  });
});
