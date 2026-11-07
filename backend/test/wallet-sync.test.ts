import { beforeEach, describe, expect, it } from 'vitest';
import { freeByChain, setWalletSyncDeps, syncArcWallet } from '../src/lib/wallet-sync.js';

const ME = '0xa004000000000000000000000000000000000000';
const OTHER = '0x1111111111111111111111111111111111111111';
const USDC = '0x3600000000000000000000000000000000000000';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const pad = (a: string) => `0x${a.slice(2).padStart(64, '0')}`;

type Tx = { hash: string; from: string; to: string; value: bigint };
type Log = { address: string; topics: string[]; data: string; transactionHash: string };

/** A fake Arc: balance changes at given blocks; each change block holds the txs/logs that caused it. */
function fakeChain(head: bigint, changes: { block: bigint; balance: bigint; txs?: Tx[]; logs?: Log[] }[], opts: { fail?: boolean } = {}) {
  const calls = { readContract: 0 };
  const balanceAt = (n: bigint) => { let b = 0n; for (const c of changes) if (c.block <= n) b = c.balance; return b; };
  return {
    calls,
    client: {
      getBlockNumber: async () => { if (opts.fail) throw new Error('rpc down'); return head; },
      readContract: async ({ blockNumber }: { blockNumber?: bigint }) => { calls.readContract++; return balanceAt(blockNumber ?? head); },
      getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({
        timestamp: 1_794_000_000n + blockNumber / 2n,
        transactions: changes.find(c => c.block === blockNumber)?.txs ?? [],
      }),
      getLogs: async ({ fromBlock }: { fromBlock: bigint }) => changes.find(c => c.block === fromBlock)?.logs ?? [],
    },
  };
}

/** A capturing `sql` tag that understands the handful of statements wallet-sync issues. */
function fakeSql(anchor: Date) {
  const deposits: { txHash: string; from: string; usd6: bigint; status: string }[] = [];
  const events: unknown[] = [];
  const sql = Object.assign(async (strings: TemplateStringsArray, ...v: unknown[]) => {
    const q = strings.join('?');
    if (q.includes('SELECT COALESCE(')) return [{ at: anchor }];
    if (q.includes('INSERT INTO deposits')) {
      const [, , txHash, from, usd6, status] = v as [string, string, string, string, string, string];
      if (deposits.some(d => d.txHash === txHash)) return [];
      deposits.push({ txHash, from, usd6: BigInt(usd6), status }); return [{ id: 'x' }];
    }
    if (q.includes('INSERT INTO events')) { events.push(v); return []; }
    if (q.includes('SUM(amount_usd6)')) {
      const arc = deposits.filter(d => d.status === 'added').reduce((s, d) => s + d.usd6, 0n);
      return arc ? [{ chain: 'arc', amount: arc }] : [];
    }
    throw new Error(`unexpected query: ${q.slice(0, 80)}`);
  }, { json: (x: unknown) => x });
  return { sql, deposits, events };
}

const user = { id: '9d6a7180-0000-0000-0000-000000000000', evmAddress: ME };
const HEAD = 30_000_000n;

describe('Arc wallet deposit sync', () => {
  beforeEach(() => setWalletSyncDeps({}));

  it('finds a native USDC send (no ERC-20 log) and records it once, with its real tx', async () => {
    const chain = fakeChain(HEAD, [{ block: HEAD - 2000n, balance: 240_000n, txs: [{ hash: '0xb6e0bb25', from: OTHER, to: ME, value: 240_000_000_000_000_000n }] }]);
    const db = fakeSql(new Date(Date.now() - 3600_000));
    setWalletSyncDeps({ client: chain.client, sql: db.sql });
    expect(await syncArcWallet(user, { wait: true })).toBe(240_000n);
    expect(db.deposits).toEqual([{ txHash: '0xb6e0bb25', from: OTHER, usd6: 0n + 240_000n, status: 'below_min' }]);
    expect(db.events).toHaveLength(0); // $0.24 is under the $1 minimum: shown in the balance, no "added" event
    // Forced re-sync: no duplicate rows.
    expect(await syncArcWallet(user, { force: true, wait: true })).toBe(240_000n);
    expect(db.deposits).toHaveLength(1);
  });

  it('records an ERC-20 Transfer deposit over the minimum and raises an activity event', async () => {
    const log: Log = { address: USDC, topics: [TRANSFER, pad(OTHER), pad(ME)], data: `0x${(25_000_000n).toString(16)}`, transactionHash: '0xerc20' };
    const chain = fakeChain(HEAD, [{ block: HEAD - 500n, balance: 25_000_000n, logs: [log] }]);
    const db = fakeSql(new Date(Date.now() - 3600_000));
    setWalletSyncDeps({ client: chain.client, sql: db.sql });
    expect(await syncArcWallet(user, { wait: true })).toBe(25_000_000n);
    expect(db.deposits).toEqual([{ txHash: '0xerc20', from: OTHER, usd6: 25_000_000n, status: 'added' }]);
    expect(db.events).toHaveLength(1);
    const free = await freeByChain(user);
    expect(free.total).toBe(25_000_000n);
    expect(free.byChain.arc).toBe(25_000_000n);
  });

  it('walks several changes: two deposits then a spend; the spend records nothing', async () => {
    const chain = fakeChain(HEAD, [
      { block: HEAD - 3000n, balance: 5_000_000n, txs: [{ hash: '0xa', from: OTHER, to: ME, value: 5_000_000n * 1_000_000_000_000n }] },
      { block: HEAD - 2000n, balance: 12_000_000n, txs: [{ hash: '0xb', from: OTHER, to: ME, value: 7_000_000n * 1_000_000_000_000n }] },
      { block: HEAD - 1000n, balance: 2_000_000n, txs: [{ hash: '0xspend', from: ME, to: OTHER, value: 10_000_000n * 1_000_000_000_000n }] },
    ]);
    const db = fakeSql(new Date(Date.now() - 3600_000));
    setWalletSyncDeps({ client: chain.client, sql: db.sql });
    expect(await syncArcWallet(user, { wait: true })).toBe(2_000_000n);
    expect(db.deposits.map(d => [d.txHash, d.usd6])).toEqual([['0xa', 5_000_000n], ['0xb', 7_000_000n]]);
    // The live balance (what's actually in the wallet) wins over the sum of deposits.
    expect((await freeByChain(user)).byChain.arc).toBe(2_000_000n);
  });

  it('is throttled: a second call within 15 s does not touch the chain', async () => {
    const chain = fakeChain(HEAD, [{ block: HEAD - 10n, balance: 3_000_000n, txs: [{ hash: '0xt', from: OTHER, to: ME, value: 3_000_000n * 1_000_000_000_000n }] }]);
    const db = fakeSql(new Date(Date.now() - 600_000));
    setWalletSyncDeps({ client: chain.client, sql: db.sql });
    await syncArcWallet(user, { wait: true });
    const reads = chain.calls.readContract;
    expect(await syncArcWallet(user)).toBe(3_000_000n);
    expect(chain.calls.readContract).toBe(reads);
  });

  it('falls back to recorded deposits when Arc is unreachable', async () => {
    const chain = fakeChain(HEAD, [], { fail: true });
    const db = fakeSql(new Date());
    db.deposits.push({ txHash: '0xold', from: OTHER, usd6: 4_000_000n, status: 'added' });
    setWalletSyncDeps({ client: chain.client, sql: db.sql });
    expect(await syncArcWallet(user)).toBeNull();
    expect((await freeByChain(user)).total).toBe(4_000_000n);
  });
});

describe('Arc wallet balance is not blocked by the deposit scan', () => {
  it('returns the live balance before the slow scan finishes, then records the deposit', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const chain = fakeChain(HEAD, [{ block: HEAD - 100n, balance: 9_000_000n, txs: [{ hash: '0xslow', from: OTHER, to: ME, value: 9_000_000n * 1_000_000_000_000n }] }]);
    const slowBlock = chain.client.getBlock;
    chain.client.getBlock = async (a: { blockNumber: bigint }) => { await gate; return slowBlock(a); };
    const db = fakeSql(new Date(Date.now() - 3600_000));
    setWalletSyncDeps({ client: chain.client, sql: db.sql });
    expect(await syncArcWallet(user)).toBe(9_000_000n);
    expect(db.deposits).toHaveLength(0); // scan still running
    release();
    await syncArcWallet(user, { wait: true });
    expect(db.deposits.map(d => d.txHash)).toEqual(['0xslow']);
  });
});
