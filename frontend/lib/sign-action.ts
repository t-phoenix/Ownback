/** SignableAction runner — Privy or seed (Q9). circle_challenge is legacy. */
import type { SignableAction } from "./api";

export type SignResult = { txHash?: string; signature?: string; skipped?: true };

type WalletBridge = {
  sendCalls: (chain: string, calls: { to: string; data: string; value: "0" }[]) => Promise<string>;
  signAndSendSol: (txBase64: string, feePayer: string) => Promise<string>;
  signTypedData: (typedData: unknown) => Promise<string>;
};

let privyBridge: WalletBridge | null = null;
let seedBridge: WalletBridge | null = null;

export function setPrivyBridge(bridge: WalletBridge | null) { privyBridge = bridge; }
export function setSeedBridge(bridge: WalletBridge | null) { seedBridge = bridge; }

/**
 * A call with empty calldata does nothing useful on the vault. The API returns these only while it
 * runs with MOCK_CHAIN; we never broadcast them from a real wallet. The API then accepts the
 * submission without a tx hash (and refuses it once MOCK_CHAIN is off).
 */
export function isNoopAction(a: SignableAction): boolean {
  return a.kind === "evm_calls" && a.calls.every(c => !c.data || c.data === "0x");
}

export async function signAction(a: SignableAction, opts: { prefer: "privy" | "seed" } = { prefer: "privy" }): Promise<SignResult> {
  if (isNoopAction(a)) return { skipped: true };
  const bridge = opts.prefer === "privy" ? privyBridge ?? seedBridge : seedBridge ?? privyBridge;
  if (!bridge) throw Object.assign(new Error("CHALLENGE_FAILED"), { code: "CHALLENGE_FAILED" });
  switch (a.kind) {
    case "evm_calls": return { txHash: await bridge.sendCalls(a.chain, a.calls) };
    case "sol_tx": return { txHash: await bridge.signAndSendSol(a.txBase64, a.feePayer) };
    case "typed_data": return { signature: await bridge.signTypedData(a.typedData) };
  }
}
