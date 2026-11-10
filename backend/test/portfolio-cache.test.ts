import { describe, expect, it, vi } from 'vitest';

const free = vi.fn(async () => ({ total: 7_000_000n, arriving: 0n, byChain: {} }));
vi.mock('../src/lib/wallet-sync.js', () => ({ freeByChain: free }));
vi.mock('../src/lib/env.js', () => ({ mockChain: () => true }));
vi.mock('../src/db/client.js', () => ({ getSql: () => async () => [] }));

const { portfolio } = await import('../src/lib/portfolio.js');

describe('portfolio cache', () => {
  it('shares one read across concurrent and recent calls, and re-reads when fresh', async () => {
    const user = { id: '00000000-0000-0000-0000-000000000001' };
    const [a, b] = await Promise.all([portfolio(user), portfolio(user)]);
    await portfolio(user);
    expect(free).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(a.dollars).toBe(7_000_000n);

    await portfolio(user, { fresh: true });
    expect(free).toHaveBeenCalledTimes(2);
    await portfolio({ id: '00000000-0000-0000-0000-000000000002' });
    expect(free).toHaveBeenCalledTimes(3);
  });
});
