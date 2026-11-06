/** SignableAction runner — Privy or seed (Q9). circle_challenge is legacy. */

export type SignableAction =
  | {
      kind: "evm_calls";
      chain: string;
      calls: { to: string; data: string; value: "0" }[];
      summary: string;
    }
  | { kind: "sol_tx"; txBase64: string; feePayer: "kora" | "user" | "deposit_relay"; summary: string }
  | { kind: "typed_data"; typedData: unknown; summary: string }
  | { kind: "circle_challenge"; challengeIds: string[]; summary: string };

export type SignResult = { txHash?: string; signature?: string };

type WalletBridge = {
  sendCalls: (chain: string, calls: { to: string; data: string; value: "0" }[]) => Promise<string>;
  signAndSendSol: (txBase64: string, feePayer: string) => Promise<string>;
  signTypedData: (typedData: unknown) => Promise<string>;
};

/** Wire Privy / seed bridges from the app shell once SDKs are ready. */
let privyBridge: WalletBridge | null = null;
let seedBridge: WalletBridge | null = null;

export function setPrivyBridge(bridge: WalletBridge | null) {
  privyBridge = bridge;
}

export function setSeedBridge(bridge: WalletBridge | null) {
  seedBridge = bridge;
}

export async function signAction(
  a: SignableAction,
  opts: { prefer: "privy" | "seed" } = { prefer: "privy" },
): Promise<SignResult> {
  if (a.kind === "circle_challenge") {
    throw new Error("legacy circle_challenge unused (Q9)");
  }

  const bridge = opts.prefer === "privy" ? privyBridge ?? seedBridge : seedBridge ?? privyBridge;
  if (!bridge) {
    // MOCKS: return a deterministic placeholder so UI flows stay green.
    if (process.env.NEXT_PUBLIC_MOCKS === "1") {
      if (a.kind === "typed_data") return { signature: "0xmock" };
      return { txHash: `0xmock${Date.now().toString(16)}` };
    }
    throw new Error("No wallet bridge configured");
  }

  switch (a.kind) {
    case "evm_calls":
      return { txHash: await bridge.sendCalls(a.chain, a.calls) };
    case "sol_tx":
      return { txHash: await bridge.signAndSendSol(a.txBase64, a.feePayer) };
    case "typed_data":
      return { signature: await bridge.signTypedData(a.typedData) };
  }
}
