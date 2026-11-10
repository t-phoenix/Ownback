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
export type Price = { usd6PerUnit: Usd6; at: string; source: string };
export type HoldingRow = { assetId: string; name: string; icon?: string; subtitle: string; qty?: string; token?: string; chain?: string; valueUsd6: Usd6; price?: Price };
export type Home = { balance: Balance; stats: { receipts: number; spendingUsd6: Usd6; inJarsUsd6: Usd6 }; topHoldings: HoldingRow[]; recentReceipts: ReceiptRow[]; nextBuy: { at: string; readyJars: number } };
export type Holdings = { balance: Balance; sections: { key: string; totalUsd6: Usd6; rows: HoldingRow[] }[] };
export type HoldingDetail = HoldingRow & { spentThisYearUsd6: Usd6; avgPriceUsd6: Usd6; paidTotalUsd6: Usd6; buys: { batchId: string; at: string; qty: string; priceUsd6: Usd6; amountUsd6: Usd6 }[]; proof: { ogRequestId?: string; arcTx?: string; venueTx?: string; arkivKey?: string; links: Record<string, string> }; issuerNote: string };
export type JarState = "filling" | "ready" | "approved" | "buying" | "returning" | "paused" | "fees_high" | "no_venue";
export type Jar = { assetId: string; name: string; icon?: string; role: string; amountUsd6: Usd6; readyMinUsd6: Usd6; state: JarState; token?: string; price?: Price; note?: string };
export type Jars = { jars: Jar[]; nextReminderAt: string; estFeesUsd6: Usd6 };
export type Fees = { totalUsd6: Usd6; pctBps: number; covered?: boolean; withinCap?: boolean };
export type SignableAction =
  | { kind: "evm_calls"; chain: string; calls: { to: string; data: string; value: "0" }[]; labels?: string[]; summary: string }
  | { kind: "sol_tx"; txBase64: string; feePayer: string; summary: string }
  | { kind: "typed_data"; typedData: unknown; summary: string };
export type BuyRow = { assetId: string; name: string; icon?: string; amountUsd6: Usd6; jarAmountUsd6: Usd6; suggestedUsd6: Usd6; token?: string; mint?: string; decimals?: number; issuer?: string; chain: string; venue: string; price: { usd6PerUnit: Usd6 }; refPriceUsd6: Usd6; estQty: string; fees: Fees; selectable: boolean; reason?: "fees_high" | "no_venue"; arkiv?: { key: string; url: string } };
export type BuyReview = { quoteId: string; expiresAt: string; rows: BuyRow[]; totalUsd6: Usd6; fees: Fees; funding: { solanaUsdc6: Usd6; arcUsdc6: Usd6; bridgeUsd6: Usd6 }; destination: string };
export type BuyStatus = "bridging" | "attesting" | "minting" | "swap_ready" | "swapping" | "done" | "done_partial" | "failed";
export type BuyEntry = { assetId: string; name: string; icon?: string; token?: string; status: "quoted" | "waiting" | "sent" | "bought" | "paused"; amountUsd6: Usd6; spentUsd6?: Usd6; fillPriceUsd6?: Usd6; qty?: string; error?: string; venueTx?: string; explorerUrl?: string };
export type BuyProgress = { batchId: string; status: BuyStatus; startedAt: string; totalUsd6: Usd6; bridgeUsd6: Usd6; error?: string; links: { arc?: string; mint?: string }; entries: BuyEntry[]; boughtUsd6: Usd6; destination: string };
export type BuyStart = { batchId: string; action?: Extract<SignableAction, { kind: "evm_calls" }> };
export type SolAction = Extract<SignableAction, { kind: "sol_tx" }>;
export type SellReview = { assetId: string; name: string; icon?: string; token: string; mint: string; decimals: number; heldQty: string; qty: string; amountRaw: string; estUsdcUsd6: Usd6; priceUsd6: Usd6; fees: Fees; destination: string };
export type SellProgress = { sellId: string; status: "signing" | "sent" | "done" | "failed"; assetId: string; qty: string; venueTx?: string; explorerUrl?: string; receivedUsd6?: Usd6; error?: string };
export type MoveProgress = { moveId: string; status: string; amountUsd6: Usd6; links: { sol?: string; arc?: string }; error?: string };
export type Allocation = { assetId: string; name: string; icon?: string; role: "maker" | "supplier" | "material" | "fallback"; tokenized: boolean; amountUsd6: Usd6; selected: boolean; why?: string };
export type PurchaseStatus = "reading" | "read_failed" | "needs_details" | "ready" | "needs_review" | "not_listed" | "skipped" | "confirming" | "saved" | "deleted";
export type ReadStep = { key: "read" | "convert" | "understand" | "jury" | "judge" | "resolve"; state: "todo" | "running" | "done" | "failed"; label: string };
export type ReadError = "not_a_receipt" | "og_unavailable" | "timeout" | "no_total" | "no_product";
export type DetailItem = { name: string; brand?: string | null; model?: string | null; category?: string | null; qty: number; unitPrice?: string | null; lineTotal?: string | null };
export type PurchaseDetails = { merchant?: string | null; date?: string | null; currency: string; subtotal?: string | null; tax?: string | null; total: string; items: DetailItem[] };
export type DetailField = "merchant" | "date" | "currency" | "total" | "items";
/** D30 jury row: only `buyable` rows can get money. */
export type JuryRow = { name: string; ticker?: string; role?: string; why: string; agree: number; of: number; status: "buyable" | "tokenized_unverified" | "not_onchain" | "private"; assetId?: string; symbol?: string };
export type Analysis = { productType: "physical" | "digital" | "service" | "cpg" | null; category: string | null; parent: JuryRow | null; enablers: JuryRow[]; commodities: JuryRow[]; jurors: { model: string; persona: string; ok: boolean }[]; cached: boolean };
export type Purchase = { id: string; status: PurchaseStatus; source: string; steps: ReadStep[]; receipt?: { shop: string; place?: string; date: string; items: string[]; local: { amount: string; currency: string }; fxRate: string; amountUsd6: Usd6 }; details?: Partial<PurchaseDetails> & { missing?: DetailField[] }; analysis?: Analysis; investUsd6?: Usd6; rateBps?: number; split?: { maker: number; behind: number; materials: number }; allocations: Allocation[]; ogRequestIds: string[]; readError?: ReadError; limit?: { usedUsd6: Usd6; capUsd6: Usd6; leftUsd6: Usd6 } };
export type Receipts = { stats: { count: number; spentUsd6: Usd6; putToWorkUsd6: Usd6 }; groups: { month: string; rows: ReceiptRow[] }[]; nextCursor: string | null };
export type Activity = { groups: { label: "Today" | "Earlier"; items: { id: string; kind: string; title: string; body: string; link: string; at: string }[] }[] };
export type Rules = { rateBps: number; monthlyCapUsd6: Usd6; readyMinUsd6: Usd6; maxFeeBps: number; fallbackAsset: string; split: { maker: number; behind: number; materials: number }; buyDay: "sun"; onchainSynced: boolean };
export type DepositAddress = { chain: string; address: string; minUsd6: Usd6; sameAddressChains: string[] };
export type DepositWatch = { checkedAt: string; deposit?: { id: string; chain: string; amountUsd6: Usd6; status: string } };
export type GmailState = { state: "none" | "no_access" | "scanning" | "found" | "caught_up" | "revoked"; email?: string; newCount?: number; firstShops?: string[] };

/* ───────── Endpoints ───────── */

export const api = {
  authPrivy: (accessToken: string) => send<{ user: Me }>("POST", "/auth/privy", { accessToken }),
  logout: () => send<void>("POST", "/auth/logout", {}),
  me: () => get<Me>("/me"),
  home: () => get<Home>("/home"),
  holdings: () => get<Holdings>("/holdings"),
  holding: (id: string) => get<HoldingDetail>(`/holdings/${encodeURIComponent(id)}`),
  jars: () => get<Jars>("/jars"),
  buysReview: (all = false, amounts?: Record<string, string>) =>
    amounts && Object.keys(amounts).length
      ? send<BuyReview>("POST", "/buys/review", { include: all ? "all" : "ready", amounts }, true)
      : get<BuyReview>(`/buys/review${all ? "?include=all" : ""}`),
  buy: (quoteId: string) => send<BuyStart>("POST", "/buys", { quoteId }, true),
  buyArcSubmitted: (batchId: string, txHash: string) => send<{ status: BuyStatus }>("POST", `/buys/${batchId}/arc-submitted`, { txHash }),
  buySwap: (batchId: string, assetId: string) => send<{ action: SolAction; estQty: string; token: string }>("POST", `/buys/${batchId}/swaps/${encodeURIComponent(assetId)}`, {}),
  buySwapSubmit: (batchId: string, assetId: string, signedTx: string) => send<{ status: "bought"; venueTx: string; explorerUrl: string; qty: string; spentUsd6: Usd6 }>("POST", `/buys/${batchId}/swaps/${encodeURIComponent(assetId)}/submit`, { signedTx }),
  buyRetry: (batchId: string) => send<{ status: BuyStatus }>("POST", `/buys/${batchId}/retry`, {}),
  arcTx: (hash: string) => get<{ status: "pending" | "success" | "reverted"; explorerUrl: string }>(`/chain/arc/tx/${hash}`),
  buyProgress: (batchId: string) => get<BuyProgress>(`/buys/${batchId}`),
  sellsReview: (assetId: string, qty?: string) => get<SellReview>(`/sells/review?assetId=${encodeURIComponent(assetId)}${qty ? `&qty=${encodeURIComponent(qty)}` : ""}`),
  sell: (assetId: string, qty?: string) => send<{ sellId: string; action?: SolAction; estUsdcUsd6?: Usd6 }>("POST", "/sells", { assetId, ...(qty ? { qty } : {}) }),
  sellSubmit: (sellId: string, signedTx: string) => send<{ status: "done"; venueTx: string; explorerUrl: string; receivedUsd6: Usd6 }>("POST", `/sells/${sellId}/submit`, { signedTx }),
  moveToArc: (amountUsd6: Usd6) => send<{ moveId: string; action: SolAction }>("POST", "/moves/to-arc", { amountUsd6 }),
  moveSubmit: (moveId: string, signedTx: string) => send<{ status: string; solTx: string; explorerUrl: string }>("POST", `/moves/${moveId}/submit`, { signedTx }),
  moveProgress: (moveId: string) => get<MoveProgress>(`/moves/${moveId}`),
  sellProgress: (sellId: string) => get<SellProgress>(`/sells/${sellId}`),
  receipts: (filter = "all") => get<Receipts>(`/receipts?filter=${filter}`),
  activity: () => get<Activity>("/activity"),
  rules: () => get<Rules>("/rules"),
  putRules: (patch: Partial<Rules>) => send<Rules>("PUT", "/rules", patch),
  depositAddress: (chain: string) => get<DepositAddress>(`/deposits/address?chain=${chain}`),
  depositWatch: (chain: string, since?: string) => get<DepositWatch>(`/deposits/watch?chain=${chain}${since ? `&since=${encodeURIComponent(since)}` : ""}`),
  gmailState: () => get<GmailState>("/gmail/state"),
  gmailConnect: () => send<{ authUrl: string }>("POST", "/gmail/connect", {}),
  createPurchaseMedia: (field: "image" | "audio", file: Blob, name: string) => { const f = new FormData(); f.append(field, file, name); return send<{ purchaseId: string }>("POST", "/purchases", f, true); },
  createPurchaseTyped: (text: { product: string; amount: string; currency: string; maker?: string; model?: string; shop?: string; date?: string }) => send<{ purchaseId: string }>("POST", "/purchases", { text }, true),
  purchase: (id: string) => get<Purchase>(`/purchases/${id}`),
  saveDetails: (id: string, d: PurchaseDetails) => send<Purchase>("PUT", `/purchases/${id}/details`, d),
  deselect: (id: string, deselect: string[]) => send<Purchase>("PUT", `/purchases/${id}/assets`, { deselect }),
  makerOnly: (id: string, s: { maker: number; behind: number; materials: number }) => send<Purchase>("PUT", `/purchases/${id}/split`, { ...s, makerOnly: true, saveForFuture: false }),
  fallback: (id: string, choice: "fallback" | "skip") => send<Purchase>("PUT", `/purchases/${id}/fallback`, { choice }),
  confirm: (id: string, amountUsd6?: Usd6) =>
    send<{ action: SignableAction }>("POST", `/purchases/${id}/confirm`, amountUsd6 ? { amountUsd6 } : {}, true),
  confirmSubmitted: (id: string, txHash?: string) => send<Purchase>("POST", `/purchases/${id}/confirm/submitted`, txHash ? { txHash } : {}),
  exportData: () => get<unknown>("/me/export"),
};
