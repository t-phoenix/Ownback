/**
 * Typed client for the Ownback API (backend/api-contract.md).
 * Always same-origin `/api`: next.config.ts proxies it to NEXT_PUBLIC_API_URL, so the
 * Lax session cookie works in production without cross-site CORS.
 */
const API_BASE = "/api";

export type Usd6 = string;

export class ApiError extends Error {
  constructor(public code: string, public status: number, public details?: unknown) { super(code); }
}

function csrfHeader(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const m = document.cookie.match(/(?:^|; )ob_csrf=([^;]*)/);
  return m ? { "x-ob-csrf": decodeURIComponent(m[1]) } : {};
}

export const idempotencyKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export async function apiJson<T>(path: string, init: RequestInit & { idempotent?: boolean } = {}): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isForm || !init.body ? {} : { "content-type": "application/json" }),
    ...csrfHeader(),
    ...(init.idempotent ? { "Idempotency-Key": idempotencyKey() } : {}),
    ...((init.headers as Record<string, string>) || {}),
  };
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError("OFFLINE", 0);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (body as { error?: { code?: string; details?: unknown } })?.error;
    throw new ApiError(err?.code || (res.status === 401 ? "UNAUTHENTICATED" : "UPSTREAM"), res.status, err?.details);
  }
  return body as T;
}

const get = <T,>(p: string) => apiJson<T>(p);
const send = <T,>(method: string, p: string, body?: unknown, idempotent = false) =>
  apiJson<T>(p, { method, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body), idempotent });

/* ───────── Types (subset of api-contract.md the UI reads) ───────── */

export type Me = { id: string; authKind: "privy" | "seed"; email?: string; displayName: string; evmAddress?: string; solAddress?: string; referralCode: string; onboarded: boolean };
export type Balance = { totalUsd6: Usd6; byType: { stocksCommodities: Usd6; stablecoins: Usd6; crypto: Usd6 }; stale: boolean; pricesAt: string; usdc: { freeUsd6: Usd6; inJarsUsd6: Usd6; arrivingUsd6: Usd6 } };
export type ReceiptStatus = "bought" | "in_jar" | "needs_review" | "fallback";
export type ReceiptRow = { id: string; shop: string; item: string; local: { amount: string; currency: string }; amountUsd6: Usd6; date: string; status: ReceiptStatus; investUsd6: Usd6 };
export type HoldingRow = { assetId: string; name: string; subtitle: string; qty?: string; token?: string; chain?: string; valueUsd6: Usd6 };
export type Home = { balance: Balance; stats: { receipts: number; spendingUsd6: Usd6; inJarsUsd6: Usd6 }; topHoldings: HoldingRow[]; recentReceipts: ReceiptRow[]; nextBuy: { at: string; readyJars: number } };
export type Holdings = { balance: Balance; sections: { key: string; totalUsd6: Usd6; rows: HoldingRow[] }[] };
export type HoldingDetail = HoldingRow & { spentThisYearUsd6: Usd6; avgPriceUsd6: Usd6; paidTotalUsd6: Usd6; buys: { batchId: string; at: string; qty: string; priceUsd6: Usd6; amountUsd6: Usd6 }[]; proof: { ogRequestId?: string; arcTx?: string; venueTx?: string; arkivKey?: string; links: Record<string, string> }; issuerNote: string };
export type JarState = "filling" | "ready" | "approved" | "buying" | "returning" | "paused" | "fees_high" | "no_venue";
export type Jar = { assetId: string; name: string; role: string; amountUsd6: Usd6; readyMinUsd6: Usd6; state: JarState; note?: string };
export type Jars = { jars: Jar[]; nextReminderAt: string; estFeesUsd6: Usd6 };
export type Fees = { totalUsd6: Usd6; pctBps: number; covered?: boolean; withinCap?: boolean };
export type BuyReview = { quoteId: string; expiresAt: string; rows: { assetId: string; name: string; amountUsd6: Usd6; token?: string; chain: string; venue: string; price: { usd6PerUnit: Usd6 }; estQty: string; maxPriceUsd6: Usd6; fees: Fees; selectable: boolean; reason?: string; arkiv?: { key: string; url: string } }[]; totalUsd6: Usd6; fees: Fees; destination: string; approval: { kind: "typed_data"; typedData: unknown } };
export type BuyProgress = { batchId: string; status: string; entries: { assetId: string; name: string; status: string; amountUsd6: Usd6; spentUsd6?: Usd6; fillPriceUsd6?: Usd6; qty?: string }[]; totals?: { boughtUsd6: Usd6; leftInJarsUsd6: Usd6; feesUsd6: Usd6; slippageBps: number }; destination: string };
export type Allocation = { assetId: string; name: string; role: "maker" | "supplier" | "material" | "fallback"; tokenized: boolean; amountUsd6: Usd6; selected: boolean; why?: string };
export type PurchaseStatus = "reading" | "read_failed" | "ready" | "needs_review" | "not_listed" | "skipped" | "confirming" | "saved" | "deleted";
export type Purchase = { id: string; status: PurchaseStatus; source: string; receipt?: { shop: string; place?: string; date: string; items: string[]; local: { amount: string; currency: string }; fxRate: string; amountUsd6: Usd6 }; investUsd6?: Usd6; rateBps?: number; split?: { maker: number; behind: number; materials: number }; allocations: Allocation[]; ogRequestIds: string[]; readError?: "no_total" | "no_product" | "not_a_receipt"; limit?: { usedUsd6: Usd6; capUsd6: Usd6; leftUsd6: Usd6 } };
export type Receipts = { stats: { count: number; spentUsd6: Usd6; putToWorkUsd6: Usd6 }; groups: { month: string; rows: ReceiptRow[] }[]; nextCursor: string | null };
export type Activity = { groups: { label: "Today" | "Earlier"; items: { id: string; kind: string; title: string; body: string; link: string; at: string }[] }[] };
export type Rules = { rateBps: number; monthlyCapUsd6: Usd6; readyMinUsd6: Usd6; maxFeeBps: number; fallbackAsset: string; split: { maker: number; behind: number; materials: number }; buyDay: "sun"; onchainSynced: boolean };
export type DepositAddress = { chain: string; address: string; minUsd6: Usd6; sameAddressChains: string[] };
export type DepositWatch = { checkedAt: string; deposit?: { id: string; chain: string; amountUsd6: Usd6; status: string } };
export type GmailState = { state: "none" | "no_access" | "scanning" | "found" | "caught_up" | "revoked"; email?: string; newCount?: number; firstShops?: string[] };
export type SignableAction =
  | { kind: "evm_calls"; chain: string; calls: { to: string; data: string; value: "0" }[]; summary: string }
  | { kind: "sol_tx"; txBase64: string; feePayer: string; summary: string }
  | { kind: "typed_data"; typedData: unknown; summary: string };

/* ───────── Endpoints ───────── */

export const api = {
  authPrivy: (accessToken: string) => send<{ user: Me }>("POST", "/auth/privy", { accessToken }),
  logout: () => send<void>("POST", "/auth/logout", {}),
  me: () => get<Me>("/me"),
  home: () => get<Home>("/home"),
  holdings: () => get<Holdings>("/holdings"),
  holding: (id: string) => get<HoldingDetail>(`/holdings/${encodeURIComponent(id)}`),
  jars: () => get<Jars>("/jars"),
  buysReview: (all = false) => get<BuyReview>(`/buys/review${all ? "?include=all" : ""}`),
  buy: (quoteId: string, approval: unknown, signature: string) => send<{ batchIds: string[] }>("POST", "/buys", { quoteId, approval, signature }, true),
  buyProgress: (batchId: string) => get<BuyProgress>(`/buys/${batchId}`),
  receipts: (filter = "all") => get<Receipts>(`/receipts?filter=${filter}`),
  activity: () => get<Activity>("/activity"),
  rules: () => get<Rules>("/rules"),
  putRules: (patch: Partial<Rules>) => send<Rules>("PUT", "/rules", patch),
  depositAddress: (chain: string) => get<DepositAddress>(`/deposits/address?chain=${chain}`),
  depositWatch: (chain: string, since?: string) => get<DepositWatch>(`/deposits/watch?chain=${chain}${since ? `&since=${encodeURIComponent(since)}` : ""}`),
  gmailState: () => get<GmailState>("/gmail/state"),
  gmailConnect: () => send<{ authUrl: string }>("POST", "/gmail/connect", {}),
  createPurchaseMedia: (field: "image" | "audio", file: Blob, name: string) => { const f = new FormData(); f.append(field, file, name); return send<{ purchaseId: string }>("POST", "/purchases", f, true); },
  createPurchaseTyped: (text: { product: string; amount: string; currency: string; maker?: string }) => send<{ purchaseId: string }>("POST", "/purchases", { text }, true),
  purchase: (id: string) => get<Purchase>(`/purchases/${id}`),
  deselect: (id: string, deselect: string[]) => send<Purchase>("PUT", `/purchases/${id}/assets`, { deselect }),
  makerOnly: (id: string, s: { maker: number; behind: number; materials: number }) => send<Purchase>("PUT", `/purchases/${id}/split`, { ...s, makerOnly: true, saveForFuture: false }),
  fallback: (id: string, choice: "fallback" | "skip") => send<Purchase>("PUT", `/purchases/${id}/fallback`, { choice }),
  confirm: (id: string) => send<{ action: SignableAction }>("POST", `/purchases/${id}/confirm`, {}, true),
  confirmSubmitted: (id: string, txHash?: string) => send<Purchase>("POST", `/purchases/${id}/confirm/submitted`, txHash ? { txHash } : {}),
  exportData: () => get<unknown>("/me/export"),
};
