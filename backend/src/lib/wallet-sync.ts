/**
 * Detect USDC deposits into a user's own Arc wallet and keep their live balance.
 *
 * Why balance-based: on Arc, USDC is the native gas token. A plain wallet send moves native value
 * and emits no ERC-20 Transfer log (verified 7 Nov: tx 0xb6e0bb25…, 0.24 USDC). The ERC-20 view at
 * 0x3600…0000 reports the same balance in 6 decimals, so we watch that balance; when it rises we
 * binary-search the block where it changed and record the incoming tx (native or ERC-20) from that block.
 */
import { createPublicClient, http, parseAbi, type PublicClient } from 'viem';
import { getSql } from '../db/client.js';
import { USDC } from '../shared/chains.js';
import { MIN_DEPOSIT_USD6 } from '../shared/timing.js';
import { newId } from './ids.js';

const ERC20 = parseAbi(['function balanceOf(address) view returns (uint256)']);
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ARC_USDC = USDC.arc.value.toLowerCase() as `0x${string}`;
/** Native value has 18 decimals on Arc; USDC amounts are 6. */
const NATIVE_TO_USD6 = 1_000_000_000_000n;
const THROTTLE_MS = 15_000;
const ARC_BLOCK_SECONDS = 0.5;

/** Test seams: a fake chain client and a capturing sql tag (also used for the dry-run against mainnet). */
const deps: { client?: PublicClient; sql?: ReturnType<typeof getSql> } = {};
export function setWalletSyncDeps(d: { client?: unknown; sql?: unknown }) {
  deps.client = d.client as PublicClient | undefined; deps.sql = d.sql as ReturnType<typeof getSql> | undefined;
  cursors.clear(); inflight.clear(); live.clear();
}

let client: PublicClient | null = null;
function arc(): PublicClient {
  if (deps.client) return deps.client;
  if (!client) client =createPublicClient({ transport: http(process.env.RPC_ARC || 'https://rpc.mainnet.arc.io', { timeout: 10_000 }) }) as PublicClient;
  return client;
}

const inflight = new Map<string, Promise<bigint | null>>();
/** Per-process cursor: last block fully scanned and the balance there. Deposits table is the durable record. */
const cursors = new Map<string, { address: string; block: bigint; balance: bigint; checkedAt: number }>();
/** Last live balance read per user (throttle). */
const live = new Map<string, { address: string; balance: bigint; head: bigint; at: number }>();

type User = { id: string; evmAddress?: string | null; createdAt?: Date };

async function balanceAt(address: `0x${string}`, blockNumber?: bigint): Promise<bigint> {
  return arc().readContract({ address: ARC_USDC, abi: ERC20, functionName: 'balanceOf', args: [address], ...(blockNumber !== undefined ? { blockNumber } : {}) });
}

/** First block in (lo, hi] whose balance differs from `base` (balance at lo). */
async function firstChange(address: `0x${string}`, lo: bigint, hi: bigint, base: bigint): Promise<bigint> {
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    if ((await balanceAt(address, mid)) === base) lo = mid; else hi = mid;
  }
  return hi;
}

/** Incoming USDC transfers to `address` inside one block: native sends and ERC-20 Transfer logs. */
async function incomingInBlock(address: `0x${string}`, blockNumber: bigint) {
  const me = address.toLowerCase();
  const block = await arc().getBlock({ blockNumber, includeTransactions: true });
  const out: { txHash: string; from: string; usd6: bigint }[] = [];
  for (const tx of block.transactions) {
    if (typeof tx === 'string') continue;
    if (tx.to?.toLowerCase() === me && tx.value > 0n) out.push({ txHash: tx.hash, from: tx.from, usd6: tx.value / NATIVE_TO_USD6 });
  }
  const logs = await arc().getLogs({ address: ARC_USDC, fromBlock: blockNumber, toBlock: blockNumber }).catch(() => []);
  for (const l of logs) {
    if (l.topics[0] !== TRANSFER_TOPIC || !l.topics[2]) continue;
    if (`0x${l.topics[2].slice(26)}`.toLowerCase() !== me) continue;
    if (out.some(o => o.txHash === l.transactionHash)) continue;
    out.push({ txHash: l.transactionHash!, from: `0x${(l.topics[1] ?? '').slice(26)}`, usd6: BigInt(l.data) });
  }
  return { out, at: new Date(Number(block.timestamp) * 1000) };
}

async function recordDeposit(userId: string, d: { txHash: string; from: string; usd6: bigint }, at: Date) {
  const sql = deps.sql ?? getSql();
  const status = d.usd6 < MIN_DEPOSIT_USD6 ? 'below_min' : 'added';
  const inserted = await sql`
    INSERT INTO deposits (id, user_id, chain, tx_hash, from_address, token, amount_usd6, status, confirmations, seen_at, added_at)
    VALUES (${newId()}::uuid, ${userId}::uuid, 'arc', ${d.txHash}, ${d.from}, 'USDC', ${d.usd6.toString()}::bigint, ${status}, 1, ${at}, ${status === 'added' ? at : null})
    ON CONFLICT (chain, tx_hash) DO NOTHING
    RETURNING id
  `;
  if (inserted.length && status === 'added') {
    await sql`
      INSERT INTO events (id, user_id, kind, payload, link, created_at)
      VALUES (${newId()}::uuid, ${userId}::uuid, 'deposit_added', ${sql.json({ amountUsd6: d.usd6.toString(), chain: 'arc', txHash: d.txHash })}::jsonb, '/holdings', ${at})
    `;
  }
}

/**
 * Live USDC balance of the user's Arc wallet in usd6 (two RPC reads, throttled to 15 s), or null if Arc
 * can't be reached. If the balance moved since the last scan, a background scan records the deposits
 * (pass `wait: true` to await it). The balance never waits on the scan: first scans take ~10 s.
 */
export async function syncArcWallet(user: User, opts: { force?: boolean; wait?: boolean } = {}): Promise<bigint | null> {
  const address = user.evmAddress as `0x${string}` | undefined;
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  const key = `${user.id}:arc`;
  const addr = address.toLowerCase();
  const cached = live.get(key);
  let now: bigint, head: bigint;
  if (cached && cached.address === addr && !opts.force && Date.now() - cached.at < THROTTLE_MS) {
    ({ balance: now, head } = cached);
  } else {
    try {
      head = await arc().getBlockNumber();
      now = await balanceAt(address, head);
      live.set(key, { address: addr, balance: now, head, at: Date.now() });
    } catch (e) {
      console.error('arc wallet sync failed', (e as Error).message?.slice(0, 200));
      return cached?.address === addr ? cached.balance : null;
    }
  }
  const cursor = cursors.get(key);
  const settled = cursor && cursor.address === addr && cursor.balance === now;
  if (!settled && !inflight.has(key)) {
    const scan = scanDeposits(user.id, address, key, head, now)
      .catch(e => { console.error('arc deposit scan failed', (e as Error).message?.slice(0, 200)); return null; })
      .finally(() => inflight.delete(key));
    inflight.set(key, scan);
  }
  if (opts.wait) await inflight.get(key);
  return now;
}

/** Walk every balance change since the cursor and record increases as deposits (native or ERC-20). */
async function scanDeposits(userId: string, address: `0x${string}`, key: string, head: bigint, now: bigint): Promise<bigint | null> {
  const sql = deps.sql ?? getSql();
  const prev = cursors.get(key);
  const known = prev && prev.address === address.toLowerCase() ? prev : undefined;
  // Where to start looking. In memory: the last block we checked. After a restart: just before the latest
  // recorded Arc deposit (re-finding it is harmless: deposits are unique per tx), else signup minus an hour.
  let fromBlock: bigint;
  if (known) fromBlock = known.block;
  else {
    const anchor = await sql<{ at: Date }[]>`
      SELECT COALESCE(
        (SELECT max(seen_at) FROM deposits WHERE user_id = ${userId}::uuid AND chain = 'arc'),
        (SELECT created_at - interval '1 hour' FROM users WHERE id = ${userId}::uuid)
      ) AS at
    `;
    const at = anchor[0]?.at ?? new Date(Date.now() - 3600_000);
    const ageS = Math.max(0, (Date.now() - at.getTime()) / 1000) + 60;
    fromBlock = head - BigInt(Math.ceil(ageS / ARC_BLOCK_SECONDS));
    if (fromBlock < 0n) fromBlock = 0n;
  }
  const base = known && known.block === fromBlock ? known.balance : await balanceAt(address, fromBlock).catch(() => now);
  // Walk forward through each balance change (bounded), recording increases as deposits.
  let lo = fromBlock, b = base;
  for (let i = 0; i < 8 && b !== now && lo < head; i++) {
    const changed = await firstChange(address, lo, head, b);
    const after = await balanceAt(address, changed);
    if (after > b) {
      const { out, at } = await incomingInBlock(address, changed);
      for (const d of out) await recordDeposit(userId, d, at);
    }
    lo = changed; b = after;
  }
  // Only advance the cursor once every change up to head has been walked.
  cursors.set(key, { address: address.toLowerCase(), block: b === now ? head : lo, balance: b === now ? now : b, checkedAt: Date.now() });
  return now;
}


/**
 * Free dollars per chain: Arc is the live wallet balance; other chains are recorded deposits until
 * their watchers exist. Falls back to recorded Arc deposits if Arc can't be reached.
 */
export async function freeByChain(user: User): Promise<{ total: bigint; byChain: Record<string, bigint>; live: boolean }> {
  const sql = deps.sql ?? getSql();
  const rows = await sql<{ chain: string; amount: bigint }[]>`
    SELECT chain, COALESCE(SUM(amount_usd6), 0) AS amount FROM deposits
    WHERE user_id = ${user.id}::uuid AND status = 'added' GROUP BY chain
  `;
  const byChain: Record<string, bigint> = {};
  for (const r of rows) byChain[r.chain] = BigInt(r.amount);
  const arcLive = await syncArcWallet(user);
  if (arcLive !== null) byChain.arc = arcLive;
  const total = Object.values(byChain).reduce((s, v) => s + v, 0n);
  return { total, byChain, live: arcLive !== null };
}
