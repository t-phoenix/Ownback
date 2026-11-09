/** SignableAction runner — Privy or seed (Q9). circle_challenge is legacy. */
import { api, type SignableAction } from "./api";
import { isArcBuyCalls } from "./arc-guard";

export type SignResult = { txHash?: string; txHashes?: string[]; signedTx?: string; signature?: string; skipped?: true };

export type EvmCall = { to: string; data: string; value: "0" };
type WalletBridge = {
  /** Broadcast one Arc tx from the user's embedded wallet; returns its hash. `headless` skips the wallet popup. */
  sendEvmTx: (chainId: number, call: EvmCall, headless?: boolean) => Promise<string>;
  /** Add the user's signature to a relay-signed Solana tx; returns the signed tx (base64). Never broadcasts. */
  signSol: (txBase64: string) => Promise<string>;
  signTypedData: (typedData: unknown) => Promise<string>;
};

let privyBridge: WalletBridge | null = null;
let seedBridge: WalletBridge | null = null;

export function setPrivyBridge(bridge: WalletBridge | null) { privyBridge = bridge; }
export function setSeedBridge(bridge: WalletBridge | null) { seedBridge = bridge; }

const CHAIN_IDS: Record<string, number> = { arc: 5042 };
const ARC_TX_TIMEOUT_MS = 90_000;

/** A call with empty calldata does nothing useful; the API only returns these for no-op confirmations. */
export function isNoopAction(a: SignableAction): boolean {
  return a.kind === "evm_calls" && a.calls.every(c => !c.data || c.data === "0x");
}

/** Wait for an Arc tx to land so the next call (e.g. deposit after approve) sees its effect. */
async function waitArc(hash: string): Promise<void> {
  const end = Date.now() + ARC_TX_TIMEOUT_MS;
  while (Date.now() < end) {
    const r = await api.arcTx(hash).catch(() => null);
    if (r?.status === "success") return;
    if (r?.status === "reverted") throw Object.assign(new Error("TX_REVERTED"), { code: "TX_REVERTED", txHash: hash });
    await new Promise(res => setTimeout(res, 1000));
  }
  throw Object.assign(new Error("TX_NOT_FOUND"), { code: "TX_NOT_FOUND", txHash: hash });
}

export type StepUpdate = { index: number; total: number; label: string; state: "signing" | "confirming" | "done"; txHash?: string };

export async function signAction(
  a: SignableAction,
  /** headless: the user already approved these exact steps on an Ownback screen (Arc buy calls only). */
  opts: { prefer?: "privy" | "seed"; onStep?: (s: StepUpdate) => void; headless?: boolean } = {},
): Promise<SignResult> {
  if (isNoopAction(a)) return { skipped: true };
  const prefer = opts.prefer ?? "privy";
  const bridge = prefer === "privy" ? privyBridge ?? seedBridge : seedBridge ?? privyBridge;
  if (!bridge) throw Object.assign(new Error("CHALLENGE_FAILED"), { code: "CHALLENGE_FAILED" });
  switch (a.kind) {
    case "evm_calls": {
      const chainId = CHAIN_IDS[a.chain];
      if (!chainId) throw Object.assign(new Error("CHAIN_UNSUPPORTED"), { code: "CHAIN_UNSUPPORTED" });
      // No popup means no second look: only sign headless what decodes as our own buy calls.
      if (opts.headless && !isArcBuyCalls(a.calls)) throw Object.assign(new Error("CHALLENGE_FAILED"), { code: "CHALLENGE_FAILED" });
      const hashes: string[] = [];
      for (let i = 0; i < a.calls.length; i++) {
        const label = a.labels?.[i] ?? `Step ${i + 1}`;
        opts.onStep?.({ index: i, total: a.calls.length, label, state: "signing" });
        const hash = await bridge.sendEvmTx(chainId, a.calls[i], opts.headless);
        opts.onStep?.({ index: i, total: a.calls.length, label, state: "confirming", txHash: hash });
        await waitArc(hash);
        opts.onStep?.({ index: i, total: a.calls.length, label, state: "done", txHash: hash });
        hashes.push(hash);
      }
      return { txHash: hashes[hashes.length - 1], txHashes: hashes };
    }
    case "sol_tx": return { signedTx: await bridge.signSol(a.txBase64) };
    case "typed_data": return { signature: await bridge.signTypedData(a.typedData) };
  }
}
