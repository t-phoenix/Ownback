/**
 * D29 buy pipeline. The user's own Arc USDC → vault.withdrawCrossChain (recipient forced to the user's
 * Solana USDC ATA) → Iris → relay receiveMessage on Solana → user-signed Jupiter swap per asset.
 *
 * Batch states: bridging (waiting for the user's Arc tx) → attesting → minting → swap_ready → swapping → done | done_partial | failed.
 */
import { createPublicClient, decodeEventLog, encodeFunctionData, http, parseAbi, type Hex } from 'viem';
import { getSql } from '../db/client.js';
import { CCTP, USDC } from '../shared/chains.js';
import { ApiError } from '../shared/errors.js';
import { arcChain, getKeeperWalletClient } from './keeper.js';
import { fetchAttestation, receiveOnSolana } from './cctp.js';
import { usdcAtaBytes32 } from './solana-ata.js';
import { newId } from './ids.js';
import { mockChain } from './env.js';
import { pipelineError } from './pipeline-error.js';

export const VAULT_ABI = parseAbi([
  'function solanaRecipient(address) view returns (bytes32)',
  'function free(address) view returns (uint256)',
  'function setSolanaRecipient(bytes32 ata)',
  'function deposit(uint256 amount)',
  'function withdrawCrossChain(uint256 amount, uint32 domain, uint256 maxFee)',
  'event Withdrawn(address indexed user, uint256 amount, uint32 domain, bytes32 recipient)',
]);
const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
]);
/** Left in the Arc wallet for gas (docs/05). */
export const ARC_GAS_BUFFER_USD6 = 100_000n;
const ZERO32 = `0x${'0'.repeat(64)}`;

let pub: ReturnType<typeof createPublicClient> | null = null;
export function arcPublic() {
  if (!pub) pub = createPublicClient({ chain: arcChain, transport: http(arcChain.rpcUrls.default.http[0], { timeout: 10_000 }) });
  return pub;
}

// Measured: withdrawCrossChain used ~143k gas on Arc mainnet; + approve and deposit when the wallet funds the vault first.
// shortcut: fixed gas units, upgrade to eth_estimateGas on the built calls if this needs to be exact.
const ARC_BRIDGE_GAS = 250_000n;
let gasCache: { at: number; v: bigint } | null = null;

/** Approximate Arc network fee (Usd6) the user's wallet pays to bridge USDC to Solana. Arc gas is native USDC with 18 decimals. null if the RPC fails. */
export async function arcBridgeGasUsd6(): Promise<bigint | null> {
  if (mockChain()) return 0n;
  try {
    if (!gasCache || Date.now() - gasCache.at > 60_000) gasCache = { at: Date.now(), v: await arcPublic().getGasPrice() };
    return (gasCache.v * ARC_BRIDGE_GAS) / 10n ** 12n; // wei (18 dp) → Usd6
  } catch { return null; }
}

export function vaultAddress(): `0x${string}` {
  const v = process.env.VAULT_ADDRESS;
  if (!v || !/^0x[0-9a-fA-F]{40}$/.test(v)) throw new ApiError('KEEPER_DISABLED', { reason: 'vault_not_configured' });
  return v as `0x${string}`;
}

export async function arcUsdcBalance(addr: string): Promise<bigint> {
  return arcPublic().readContract({ address: USDC.arc.value, abi: ERC20_ABI, functionName: 'balanceOf', args: [addr as Hex] });
}

/**
 * Arc calls the user signs to move `amount` of their own USDC to their own Solana USDC ATA.
 * Prepends setSolanaRecipient only the first time; reuses vault `free` before depositing more.
 */
export async function arcBridgeCalls(evmAddress: string, solAddress: string, amount: bigint) {
  const vault = vaultAddress();
  const user = evmAddress as Hex;
  const expected = usdcAtaBytes32(solAddress).toLowerCase();
  const [recipient, free, wallet] = await Promise.all([
    arcPublic().readContract({ address: vault, abi: VAULT_ABI, functionName: 'solanaRecipient', args: [user] }),
    arcPublic().readContract({ address: vault, abi: VAULT_ABI, functionName: 'free', args: [user] }),
    arcUsdcBalance(user),
  ]);
  const calls: { to: string; data: Hex; value: '0'; label: string }[] = [];
  if (recipient === ZERO32) {
    calls.push({ to: vault, value: '0', label: 'Link your Solana wallet', data: encodeFunctionData({ abi: VAULT_ABI, functionName: 'setSolanaRecipient', args: [expected as Hex] }) });
  } else if (recipient.toLowerCase() !== expected) {
    // Changing it is timelocked on the vault; never bridge to an address that isn't this user's wallet.
    throw new ApiError('NO_SOLANA_RECIPIENT', { reason: 'recipient_mismatch' });
  }
  const dep = amount > free ? amount - free : 0n;
  if (dep > 0n) {
    if (wallet < dep + ARC_GAS_BUFFER_USD6) {
      throw new ApiError('INSUFFICIENT_FREE', { availableUsd6: (wallet > ARC_GAS_BUFFER_USD6 ? wallet - ARC_GAS_BUFFER_USD6 : 0n).toString() });
    }
    calls.push({ to: USDC.arc.value, value: '0', label: 'Allow the vault to take this amount', data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [vault, dep] }) });
    calls.push({ to: vault, value: '0', label: 'Move USDC into your vault', data: encodeFunctionData({ abi: VAULT_ABI, functionName: 'deposit', args: [dep] }) });
  }
  calls.push({ to: vault, value: '0', label: 'Send USDC to your Solana wallet (CCTP)', data: encodeFunctionData({ abi: VAULT_ABI, functionName: 'withdrawCrossChain', args: [amount, CCTP.solanaDomain, 0n] }) });
  return calls;
}

/** The server never trusts "it worked": the Arc receipt must hold the vault's Withdrawn(user, amount, 5). */
export async function verifyArcBurn(txHash: string, evmAddress: string, amount: bigint): Promise<void> {
  const vault = vaultAddress().toLowerCase();
  const r = await arcPublic().getTransactionReceipt({ hash: txHash as Hex }).catch(() => null);
  if (!r) throw new ApiError('TX_NOT_FOUND', { chain: 'arc', txHash });
  if (r.status !== 'success') throw new ApiError('TX_REVERTED', { chain: 'arc', txHash });
  const ok = r.logs.some((l) => {
    if (l.address.toLowerCase() !== vault) return false;
    try {
      const ev = decodeEventLog({ abi: VAULT_ABI, data: l.data, topics: l.topics });
      return ev.eventName === 'Withdrawn' && ev.args.user.toLowerCase() === evmAddress.toLowerCase()
        && ev.args.amount === amount && ev.args.domain === CCTP.solanaDomain;
    } catch {
      return false;
    }
  });
  if (!ok) throw new ApiError('TX_NOT_FOUND', { chain: 'arc', txHash, reason: 'no_matching_withdrawn_event' });
}

type BatchRow = { id: string; user_id: string; status: string; arc_tx: string | null; cctp_message: string | null; cctp_attestation: string | null };

const running = new Set<string>();

/** Moves one batch forward through attesting → minting → swap_ready. Safe to call repeatedly. */
export async function advanceBatch(id: string): Promise<void> {
  if (running.has(id)) return;
  running.add(id);
  const sql = getSql();
  try {
    const [b] = await sql<BatchRow[]>`SELECT id, user_id, status, arc_tx, cctp_message, cctp_attestation FROM buy_batches WHERE id = ${id}::uuid`;
    if (!b) return;
    if (b.status === 'attesting' && b.arc_tx) {
      const att = await fetchAttestation(CCTP.arcDomain, b.arc_tx);
      if (!att) return;
      await sql`UPDATE buy_batches SET cctp_message = ${att.message}, cctp_attestation = ${att.attestation}, status = 'minting', error = NULL, updated_at = now() WHERE id = ${id}::uuid`;
      b.status = 'minting'; b.cctp_message = att.message; b.cctp_attestation = att.attestation;
    }
    if (b.status === 'minting' && b.cctp_message && b.cctp_attestation) {
      const [u] = await sql<{ sol_address: string }[]>`SELECT sol_address FROM users WHERE id = ${b.user_id}::uuid`;
      const sig = await receiveOnSolana(b.cctp_message, b.cctp_attestation, u!.sol_address);
      await sql`UPDATE buy_batches SET mint_tx = COALESCE(${sig}, mint_tx), status = 'swap_ready', error = NULL, updated_at = now() WHERE id = ${id}::uuid`;
    }
  } catch (e) {
    // Keep the state so the next tick / user Retry can continue; surface a short code the UI maps.
    const msg = pipelineError(e);
    await sql`UPDATE buy_batches SET error = ${msg}, updated_at = now() WHERE id = ${id}::uuid`.catch(() => {});
  } finally {
    running.delete(id);
  }
}

/** Book a filled swap against the user's jars, oldest first. Never touches more than was spent. */
export async function debitJars(userId: string, assetId: string, spent: bigint): Promise<void> {
  const sql = getSql();
  const rows = await sql<{ id: string; left: bigint }[]>`
    SELECT a.id, (a.saved_usd6 - a.bought_usd6) AS left FROM allocations a JOIN purchases p ON p.id = a.purchase_id
    WHERE p.user_id = ${userId}::uuid AND p.status = 'saved' AND a.asset_id = ${assetId} AND a.selected = true
      AND a.saved_usd6 > a.bought_usd6
    ORDER BY p.created_at ASC
  `;
  let rest = spent;
  for (const r of rows) {
    if (rest <= 0n) break;
    const take = BigInt(r.left) < rest ? BigInt(r.left) : rest;
    await sql`UPDATE allocations SET bought_usd6 = bought_usd6 + ${take.toString()}::bigint WHERE id = ${r.id}::uuid`;
    rest -= take;
  }
}

export async function logEvent(userId: string, kind: string, payload: Record<string, unknown>, link: string) {
  await getSql()`
    INSERT INTO events (id, user_id, kind, payload, link, created_at)
    VALUES (${newId()}::uuid, ${userId}::uuid, ${kind}, ${getSql().json(payload as never)}, ${link}, now())
  `;
}

const MT_ABI = parseAbi(['function receiveMessage(bytes message, bytes attestation) returns (bool)']);

/** "Move to Arc": Iris attests the user's Solana burn, then the keeper mints it on Arc (keeper pays gas). */
export async function advanceMove(id: string): Promise<void> {
  const lock = `move:${id}`;
  if (running.has(lock)) return;
  running.add(lock);
  const sql = getSql();
  try {
    const [m] = await sql<{ status: string; sol_tx: string | null }[]>`SELECT status, sol_tx FROM withdrawals WHERE id = ${id}::uuid`;
    if (!m || m.status !== 'attesting' || !m.sol_tx) return;
    const att = await fetchAttestation(CCTP.solanaDomain, m.sol_tx);
    if (!att) return;
    const keeper = getKeeperWalletClient();
    if (!keeper) throw new ApiError('KEEPER_DISABLED');
    const hash = await keeper.writeContract({
      address: CCTP.arcMessageTransmitter, abi: MT_ABI, functionName: 'receiveMessage',
      args: [att.message as Hex, att.attestation as Hex],
    });
    const r = await arcPublic().waitForTransactionReceipt({ hash });
    if (r.status !== 'success') throw new ApiError('TX_REVERTED', { chain: 'arc', hash });
    await sql`UPDATE withdrawals SET arc_tx = ${hash}, status = 'sent', error = NULL WHERE id = ${id}::uuid`;
  } catch (e) {
    const msg = e instanceof ApiError ? e.code : (e as Error).message;
    await sql`UPDATE withdrawals SET error = ${msg.slice(0, 300)} WHERE id = ${id}::uuid`.catch(() => {});
  } finally {
    running.delete(lock);
  }
}

/** In-process worker (Render runs one long-lived Node). Polls work waiting on Iris, Solana or Arc. */
export function startBuyWorker(intervalMs = 5_000): void {
  const tick = async () => {
    try {
      const sql = getSql();
      const rows = await sql<{ id: string }[]>`
        SELECT id FROM buy_batches WHERE status IN ('attesting', 'minting') AND updated_at > now() - interval '2 hours'
      `;
      const moves = await sql<{ id: string }[]>`
        SELECT id FROM withdrawals WHERE status = 'attesting' AND created_at > now() - interval '2 hours'
      `;
      await Promise.all([...rows.map((r) => advanceBatch(r.id)), ...moves.map((m) => advanceMove(m.id))]);
    } catch {
      /* DB blip: next tick */
    }
  };
  setInterval(tick, intervalMs).unref();
}
