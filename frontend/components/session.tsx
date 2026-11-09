"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { PrivyProvider, useLogin, useLogout, useModalStatus, usePrivy, useSendTransaction, useSignTypedData, useWallets } from "@privy-io/react-auth";
import { useSignTransaction as useSolSignTransaction, useWallets as useSolWallets } from "@privy-io/react-auth/solana";
import { api, ApiError, type Me } from "../lib/api";
import { clearApiCache } from "../lib/use-api";
import { setPrivyBridge } from "../lib/sign-action";
import { SessionCtx, useSession, type Session } from "./session-context";

export { useSession, MockSessionProvider } from "./session-context";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";

/** Arc mainnet (✓ contracts/chain-config.md). Gas is native USDC with 18 decimals; the ERC-20 view uses 6. */
const ARC = {
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
} as const;

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const bytesToB64 = (u8: Uint8Array) => { let s = ""; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };

async function fetchMe(): Promise<Me | null> {
  try { return await api.me(); }
  catch (e) {
    if (!(e instanceof ApiError)) throw e;
    // Logged out, or transient DB/API blip — treat as no session so Privy can re-exchange.
    if (e.status === 401 || e.code === "UNAUTHENTICATED" || e.status >= 500 || e.code === "UPSTREAM" || e.code === "INTERNAL") {
      return null;
    }
    throw e;
  }
}

/** Privy owns Google sign-in and the embedded wallets; our API owns the session cookie. */
function PrivySession({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { ready, authenticated, getAccessToken, user } = usePrivy();
  const synced = useRef(false);
  const { logout } = useLogout();
  const { signTypedData } = useSignTypedData();
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const { wallets: solWallets } = useSolWallets();
  const { signTransaction: signSolTx } = useSolSignTransaction();

  const refresh = useCallback(async () => { const m = await fetchMe().catch(() => null); setMe(m); return m; }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const exchange = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new ApiError("AUTH_INVALID", 401);
      const { user } = await api.authPrivy(token);
      clearApiCache(); setMe(user);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "AUTH_INVALID";
      setError(code);
      // Stale Privy JWT after a blip loops forever (authenticated && me===null). Force a clean re-login.
      if (code === "AUTH_INVALID") {
        await logout().catch(() => {});
        setMe(null);
      }
    } finally { setBusy(false); }
  }, [getAccessToken, logout]);

  const { login } = useLogin({ onComplete: () => { exchange(); }, onError: () => setBusy(false) });

  // If the Privy window closes without a login here (cancelled, or finished in another tab), reset the button.
  const { isOpen } = useModalStatus();
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen) { wasOpen.current = true; return; }
    if (wasOpen.current && !authenticated) { wasOpen.current = false; setBusy(false); }
  }, [isOpen, authenticated]);

  // Privy remembers the Google login; if our session cookie expired, swap a fresh token silently.
  useEffect(() => { if (ready && authenticated && me === null && !busy) exchange(); }, [ready, authenticated, me, busy, exchange]);

  // Privy creates the embedded Solana wallet just after login, so the first exchange can miss it. Re-sync once it exists.
  useEffect(() => {
    if (!me || me.solAddress || synced.current || busy) return;
    const hasSol = user?.linkedAccounts.some(a => a.type === "wallet" && "chainType" in a && a.chainType === "solana");
    if (hasSol) { synced.current = true; exchange(); }
  }, [me, user, busy, exchange]);

  // Wallet bridge for SignableActions: Arc txs from the embedded EVM wallet, Solana signatures from the embedded Solana wallet.
  useEffect(() => {
    const evm = wallets.find(w => w.walletClientType === "privy");
    const sol = solWallets.find(w => !me?.solAddress || w.address === me.solAddress) ?? solWallets[0];
    const noWallet = () => Object.assign(new Error("CHALLENGE_FAILED"), { code: "CHALLENGE_FAILED" });
    setPrivyBridge({
      signTypedData: async (td) => (await signTypedData(td as Parameters<typeof signTypedData>[0], evm ? { address: evm.address } : undefined)).signature,
      sendEvmTx: async (chainId, call) => {
        if (!evm) throw noWallet();
        const { hash } = await sendTransaction({ to: call.to, data: call.data, value: 0, chainId }, { address: evm.address });
        return hash;
      },
      signSol: async (txBase64) => {
        if (!sol) throw noWallet();
        // Headless: Privy's Solana sign modal needs config.solana.rpcs and throws in render without it,
        // which escapes ScreenBoundary (it lives in PrivyProvider) and blanks the app. The user already confirmed on Buy review.
        const { signedTransaction } = await signSolTx({ transaction: b64ToBytes(txBase64), wallet: sol, options: { uiOptions: { showWalletUIs: false } } });
        return bytesToB64(signedTransaction);
      },
    });
    return () => setPrivyBridge(null);
  }, [wallets, solWallets, me?.solAddress, signTypedData, sendTransaction, signSolTx]);

  const value = useMemo<Session>(() => ({
    me, refresh, busy, error, configured: true,
    signIn: () => { setError(null); if (authenticated) exchange(); else { setBusy(true); login({ loginMethods: ["google"] }); } },
    signOut: async () => { await api.logout().catch(() => {}); await logout().catch(() => {}); clearApiCache(); setMe(null); },
  }), [me, refresh, busy, error, authenticated, exchange, login, logout]);
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

/** Without a Privy app ID the app still renders, but sign-in says it isn't set up. */
function UnconfiguredSession({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const refresh = useCallback(async () => { const m = await fetchMe().catch(() => null); setMe(m); return m; }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const value = useMemo<Session>(() => ({
    me, refresh, busy: false, configured: false, error: "NOT_CONFIGURED",
    signIn: () => {}, signOut: async () => { await api.logout().catch(() => {}); clearApiCache(); setMe(null); },
  }), [me, refresh]);
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) return <UnconfiguredSession>{children}</UnconfiguredSession>;
  return <PrivyProvider appId={PRIVY_APP_ID} config={{
    loginMethods: ["google"],
    appearance: { theme: "light", accentColor: "#0F7B4F", landingHeader: "Sign in to Ownback", showWalletLoginFirst: false },
    embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, solana: { createOnLogin: "users-without-wallets" } },
    defaultChain: ARC,
    supportedChains: [ARC],
  }}>
    <PrivySession>{children}</PrivySession>
  </PrivyProvider>;
}
