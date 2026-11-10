/**
 * Wireframe demo numbers (docs/03). Used only by /shots for presentable screenshots.
 * shortcut: fixture-only, replace with live seed when demo user has real data
 */
import type {
  Balance, BuyProgress, BuyReview, Candles, ChartRange, GmailState, Home, Holdings, Jars, MarketBuyReview, MarketDetail, MarketItem, Markets, Me, Purchase, Receipts, Rules, SellReview,
} from "./api";

const u = (dollars: number) => String(Math.round(dollars * 1_000_000));

export const SHOT_IDS = {
  purchase: "croma-iphone",
  batch: "batch-apple",
} as const;

export const balance: Balance = {
  totalUsd6: u(234.2),
  byType: { stocksCommodities: u(59.1), stablecoins: u(175.1), crypto: u(0) },
  stale: false,
  pricesAt: "2026-11-07T03:30:00.000Z",
  usdc: { freeUsd6: u(131.5), inJarsUsd6: u(43.6), arrivingUsd6: u(0) },
};

export const me: Me = {
  id: "user_abhi",
  authKind: "privy",
  email: "abhi@ownback.app",
  displayName: "Abhi",
  evmAddress: "0xAbHi0000000000000000000000000000000Own1",
  solAddress: "AbhiSo1111111111111111111111111111111",
  referralCode: "ABHI",
  onboarded: true,
};

export const home: Home = {
  balance,
  stats: { receipts: 6, spendingUsd6: u(1842), inJarsUsd6: u(43.6) },
  topHoldings: [
    { assetId: "co:apple", name: "Apple", icon: "https://xstocks-metadata.backed.fi/logos/tokens/AAPLx.png", subtitle: "Maker · AAPLx", qty: "0.18", token: "AAPLx", chain: "solana", valueUsd6: u(42.5), price: { usd6PerUnit: u(236.41), at: "2026-11-09T10:00:00Z", source: "jupiter" } },
    { assetId: "co:tsmc", name: "TSMC", icon: "https://xstocks-metadata.backed.fi/logos/tokens/TSMx.png", subtitle: "Behind · TSMXx", qty: "0.04", token: "TSMXx", chain: "solana", valueUsd6: u(8.2), price: { usd6PerUnit: u(205.1), at: "2026-11-09T10:00:00Z", source: "jupiter" } },
    { assetId: "mat:gold", name: "Gold", icon: "https://xstocks-metadata.backed.fi/logos/tokens/GLDx.png", subtitle: "Material", qty: "0.002", token: "GLDx", chain: "solana", valueUsd6: u(5.1), price: { usd6PerUnit: u(2551.3), at: "2026-11-09T10:00:00Z", source: "jupiter" } },
  ],
  recentReceipts: [
    { id: SHOT_IDS.purchase, shop: "Croma", item: "iPhone 16 Pro", local: { amount: "79900", currency: "INR" }, amountUsd6: u(955), date: "2026-11-06", status: "in_jar", investUsd6: u(47.75) },
    { id: "airpods", shop: "Apple Store", item: "AirPods Pro", local: { amount: "24900", currency: "INR" }, amountUsd6: u(297.63), date: "2026-11-05", status: "bought", investUsd6: u(14.88) },
  ],
  nextBuy: { at: "2026-11-09T04:30:00.000Z", readyJars: 2 },
};

export const jars: Jars = {
  jars: [
    { assetId: "co:apple", name: "Apple", icon: "https://xstocks-metadata.backed.fi/logos/tokens/AAPLx.png", role: "maker", amountUsd6: u(33.43), readyMinUsd6: u(5), state: "ready", token: "AAPLx", price: { usd6PerUnit: u(236.41), at: "2026-11-09T10:00:00Z", source: "jupiter" } },
    { assetId: "co:tsmc", name: "TSMC", icon: "https://xstocks-metadata.backed.fi/logos/tokens/TSMx.png", role: "supplier", amountUsd6: u(3.18), readyMinUsd6: u(5), state: "filling", token: "TSMXx", price: { usd6PerUnit: u(205.1), at: "2026-11-09T10:00:00Z", source: "jupiter" } },
    { assetId: "co:qualcomm", name: "Qualcomm", icon: "https://xstocks-metadata.backed.fi/logos/tokens/QCOMx.png", role: "supplier", amountUsd6: u(3.18), readyMinUsd6: u(5), state: "filling" },
    { assetId: "co:corning", name: "Corning", icon: "https://xstocks-metadata.backed.fi/logos/tokens/GLWx.png", role: "supplier", amountUsd6: u(3.19), readyMinUsd6: u(5), state: "filling" },
    { assetId: "mat:gold", name: "Gold", icon: "https://xstocks-metadata.backed.fi/logos/tokens/GLDx.png", role: "material", amountUsd6: u(2.39), readyMinUsd6: u(5), state: "filling" },
    { assetId: "mat:silver", name: "Silver", icon: "https://xstocks-metadata.backed.fi/logos/tokens/SLVx.png", role: "material", amountUsd6: u(2.38), readyMinUsd6: u(5), state: "filling" },
  ],
  nextReminderAt: "2026-11-09T04:30:00.000Z",
  estFeesUsd6: u(0.12),
};

export const purchase: Purchase = {
  id: SHOT_IDS.purchase,
  status: "ready",
  source: "image",
  steps: [],
  receipt: {
    shop: "Croma",
    place: "Mumbai",
    date: "2026-11-06",
    items: ["iPhone 16 Pro 256GB"],
    local: { amount: "79900", currency: "INR" },
    fxRate: "83.6649",
    amountUsd6: u(955),
  },
  investUsd6: u(47.75),
  rateBps: 500,
  split: { maker: 70, behind: 20, materials: 10 },
  allocations: [
    { assetId: "co:apple", name: "Apple", icon: "https://xstocks-metadata.backed.fi/logos/tokens/AAPLx.png", role: "maker", tokenized: true, amountUsd6: u(33.43), selected: true, why: "Made the iPhone." },
    { assetId: "co:tsmc", name: "TSMC", icon: "https://xstocks-metadata.backed.fi/logos/tokens/TSMx.png", role: "supplier", tokenized: true, amountUsd6: u(3.18), selected: true, why: "Fabricates the A18 chip." },
    { assetId: "co:qualcomm", name: "Qualcomm", icon: "https://xstocks-metadata.backed.fi/logos/tokens/QCOMx.png", role: "supplier", tokenized: true, amountUsd6: u(3.18), selected: true, why: "Modem and RF." },
    { assetId: "co:corning", name: "Corning", icon: "https://xstocks-metadata.backed.fi/logos/tokens/GLWx.png", role: "supplier", tokenized: true, amountUsd6: u(3.19), selected: true, why: "Ceramic Shield glass." },
    { assetId: "mat:gold", name: "Gold", icon: "https://xstocks-metadata.backed.fi/logos/tokens/GLDx.png", role: "material", tokenized: true, amountUsd6: u(2.39), selected: true, why: "Bond wires and connectors." },
    { assetId: "mat:silver", name: "Silver", icon: "https://xstocks-metadata.backed.fi/logos/tokens/SLVx.png", role: "material", tokenized: true, amountUsd6: u(2.38), selected: true, why: "Conductive paste." },
  ],
  ogRequestIds: ["0g_req_croma_iphone_7nov"],
  analysis: {
    productType: "physical", category: "phone", cached: false,
    jurors: [{ model: "glm-5.3", persona: "supply chain", ok: true }, { model: "0gm-1.0", persona: "materials", ok: true }, { model: "glm-5.3", persona: "finance", ok: true }],
    parent: { name: "Apple", ticker: "AAPL", why: "Designs the iPhone and sells it.", agree: 3, of: 3, status: "buyable", assetId: "co:apple", symbol: "AAPLx" },
    enablers: [
      { name: "TSMC", ticker: "TSM", why: "Fabricates the A18 Pro chip on its 3 nm line.", agree: 3, of: 3, status: "buyable", assetId: "co:tsmc", symbol: "TSMx" },
      { name: "Qualcomm", ticker: "QCOM", why: "Supplies the 5G modem and RF front end.", agree: 2, of: 3, status: "buyable", assetId: "co:qualcomm", symbol: "QCOMx" },
      { name: "Corning", ticker: "GLW", why: "Makes the Ceramic Shield cover glass.", agree: 2, of: 3, status: "buyable", assetId: "co:corning", symbol: "GLWx" },
      { name: "Contemporary Amperex Technology Co. Limited", ticker: "300750", why: "Battery cells.", agree: 1, of: 3, status: "not_onchain" },
      { name: "Foxconn Technology Group", why: "Assembles the phone.", agree: 3, of: 3, status: "not_onchain" },
    ],
    commodities: [
      { name: "Gold", why: "Bond wires and connectors.", agree: 2, of: 3, status: "buyable", assetId: "mat:gold", symbol: "GLDx" },
      { name: "Silver", why: "Conductive paste.", agree: 1, of: 3, status: "buyable", assetId: "mat:silver", symbol: "SLVx" },
      { name: "Lithium", ticker: "LIT", why: "Battery cathode.", agree: 2, of: 3, status: "not_onchain" },
    ],
  },
};

export const buyReview: BuyReview = {
  quoteId: "quote-demo-1",
  expiresAt: new Date(Date.now() + 28_000).toISOString(),
  rows: [
    {
      assetId: "co:apple", name: "Apple", amountUsd6: u(33.43), token: "AAPLx", chain: "solana", venue: "jupiter",
      price: { usd6PerUnit: u(236.4) }, estQty: "0.1414", jarAmountUsd6: u(33.43), suggestedUsd6: u(33.43), refPriceUsd6: u(235.9),
      fees: { totalUsd6: u(0.08), pctBps: 24, withinCap: true }, selectable: true,
      arkiv: { key: "ownback.asset.v1:co:apple", url: "https://explorer.arkiv.network" },
    },
    {
      assetId: "co:tsmc", name: "TSMC", amountUsd6: u(5.12), token: "TSMXx", chain: "solana", venue: "jupiter",
      price: { usd6PerUnit: u(198.2) }, estQty: "0.0258", jarAmountUsd6: u(5.12), suggestedUsd6: u(5.12), refPriceUsd6: u(197.8),
      fees: { totalUsd6: u(0.04), pctBps: 78, withinCap: true }, selectable: true,
    },
  ],
  totalUsd6: u(38.55),
  fees: { totalUsd6: u(0.12), pctBps: 31, withinCap: true },
  destination: "AbhiSo1111111111111111111111111111111",
  funding: { solanaUsdc6: u(0), arcUsdc6: u(120), bridgeUsd6: u(38.55) },
};

export const buyDone: BuyProgress = {
  batchId: SHOT_IDS.batch,
  status: "done",
  startedAt: new Date(Date.now() - 74_000).toISOString(),
  totalUsd6: u(38.55),
  bridgeUsd6: u(38.55),
  boughtUsd6: u(38.52),
  links: { arc: "https://explorer.arc.io/tx/0x0", mint: "https://solscan.io/tx/demo" },
  entries: [
    { assetId: "co:apple", name: "Apple", icon: "https://xstocks-metadata.backed.fi/logos/tokens/AAPLx.png", status: "bought", amountUsd6: u(33.43), spentUsd6: u(33.41), fillPriceUsd6: u(236.12), qty: "0.1415" },
    { assetId: "co:tsmc", name: "TSMC", icon: "https://xstocks-metadata.backed.fi/logos/tokens/TSMx.png", status: "bought", amountUsd6: u(5.12), spentUsd6: u(5.11), fillPriceUsd6: u(197.9), qty: "0.0258" },
  ],
  destination: "AbhiSo1111111111111111111111111111111",
};

export const holdings: Holdings = {
  balance,
  sections: [
    {
      key: "makers", totalUsd6: u(42.5),
      rows: [{ assetId: "co:apple", name: "Apple", icon: "https://xstocks-metadata.backed.fi/logos/tokens/AAPLx.png", subtitle: "AAPLx · Solana", qty: "0.18", token: "AAPLx", chain: "solana", valueUsd6: u(42.5), price: { usd6PerUnit: u(236.41), at: "2026-11-09T10:00:00Z", source: "jupiter" } }],
    },
    {
      key: "behind", totalUsd6: u(11.5),
      rows: [
        { assetId: "co:tsmc", name: "TSMC", icon: "https://xstocks-metadata.backed.fi/logos/tokens/TSMx.png", subtitle: "TSMXx · Solana", qty: "0.04", token: "TSMXx", chain: "solana", valueUsd6: u(8.2), price: { usd6PerUnit: u(205.1), at: "2026-11-09T10:00:00Z", source: "jupiter" } },
        { assetId: "co:qualcomm", name: "Qualcomm", icon: "https://xstocks-metadata.backed.fi/logos/tokens/QCOMx.png", subtitle: "QCOMx · Solana", qty: "0.02", token: "QCOMx", chain: "solana", valueUsd6: u(3.3), price: { usd6PerUnit: u(165.02), at: "2026-11-09T10:00:00Z", source: "jupiter" } },
      ],
    },
    {
      key: "commodities", totalUsd6: u(5.1),
      rows: [{ assetId: "mat:gold", name: "Gold", icon: "https://xstocks-metadata.backed.fi/logos/tokens/GLDx.png", subtitle: "GLDx · Solana", qty: "0.002", token: "GLDx", chain: "solana", valueUsd6: u(5.1), price: { usd6PerUnit: u(2551.3), at: "2026-11-09T10:00:00Z", source: "jupiter" } }],
    },
    {
      key: "stablecoins", totalUsd6: u(175.1),
      rows: [{ assetId: "usdc", name: "USDC", subtitle: "Free $131.50 · in jars $43.60", valueUsd6: u(175.1) }],
    },
  ],
};

export const receipts: Receipts = {
  stats: { count: 6, spentUsd6: u(1842), putToWorkUsd6: u(92.1) },
  groups: [{
    month: "November 2026",
    rows: home.recentReceipts,
  }],
  nextCursor: null,
};

export const gmail: GmailState = { state: "caught_up", email: "abhi@ownback.app", newCount: 0 };
export const rules: Rules = {
  rateBps: 500, monthlyCapUsd6: u(50), readyMinUsd6: u(5), maxFeeBps: 500,
  fallbackAsset: "idx:sp500", split: { maker: 70, behind: 20, materials: 10 }, buyDay: "sun", onchainSynced: true,
};

export const SCREENS = ["signin", "home", "confirm", "jars", "buy-review", "buy-done", "holdings", "receipts", "settings", "type-it", "markets", "market-asset", "markets-wide", "market-asset-wide", "confirm-wide", "jars-wide"] as const;
export type ShotScreen = (typeof SCREENS)[number];

/* ───── Markets (docs/12-markets.md). Example prices only; never shown as live quotes. ───── */
const logo = (t: string) => `https://xstocks-metadata.backed.fi/logos/tokens/${t}.png`;
/** Deterministic wobble so screenshots don't change between runs. */
function walk(start: number, n: number, seed: number, drift = 0.0004): number[] {
  let x = seed, v = start; const out: number[] = [];
  for (let i = 0; i < n; i++) { x = (x * 9301 + 49297) % 233280; v *= 1 + drift + ((x / 233280) - 0.5) * 0.01; out.push(v); }
  return out;
}
const sparkOf = (p: number, seed: number, up: boolean) => walk(p * (up ? 0.985 : 1.015), 24, seed, up ? 0.0007 : -0.0007).map(u);
const mk = (assetId: string, name: string, token: string, price: number, bps: number, liq: number, cls: MarketItem["class"] = "stock", pos?: number): MarketItem => ({
  assetId, name, ticker: token.replace(/x$/, ""), token, icon: logo(token), class: cls, chain: "solana",
  priceUsd6: u(price), priceAt: new Date().toISOString(), change24hBps: bps, liquidityUsd6: u(liq),
  spark: sparkOf(price, token.length * 97 + liq % 1000, bps >= 0), held: pos != null, ...(pos != null ? { positionUsd6: u(pos) } : {}),
});
export const markets: Markets = {
  pricesAt: new Date().toISOString(),
  usMarket: "closed",
  items: [
    mk("co:apple", "Apple", "AAPLx", 231.4, 138, 1_051_524, "stock", 61.04),
    mk("co:tesla", "Tesla", "TSLAx", 402.77, 291, 3_400_000),
    mk("co:nvidia", "NVIDIA", "NVDAx", 184.12, -82, 2_750_000, "stock", 12.48),
    mk("idx:sp500", "S&P 500 ETF", "SPYx", 668.05, 31, 1_100_000, "index"),
    mk("co:microsoft", "Microsoft", "MSFTx", 512.3, -24, 880_000),
    mk("co:amazon", "Amazon", "AMZNx", 228.6, 112, 760_000),
    mk("co:meta", "Meta Platforms", "METAx", 742.1, -156, 540_000),
    mk("mat:gold", "Gold", "GLDx", 384.2, 10, 410_000, "commodity"),
    mk("co:alphabet", "Alphabet", "GOOGLx", 251.75, 47, 390_000),
    mk("co:coinbase", "Coinbase", "COINx", 318.9, -311, 270_000),
    mk("idx:nasdaq100", "Nasdaq 100 ETF", "QQQx", 602.4, 54, 250_000, "index"),
    mk("co:netflix", "Netflix", "NFLXx", 1188.2, 0, 120_000),
  ],
};
export const marketDetail: MarketDetail = {
  assetId: "co:apple", name: "Apple", ticker: "AAPL", token: "AAPLx", icon: logo("AAPLx"), class: "stock", chain: "solana",
  mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", decimals: 8, issuer: "xStocks",
  links: { mint: "https://solscan.io/token/XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", issuer: "https://xstocks.com/products" },
  priceUsd6: u(231.4), priceAt: new Date().toISOString(), change24hBps: 138, liquidityUsd6: u(1_051_524), volume24hUsd6: u(636_088), usMarket: "closed",
  position: { qty: "0.2638", valueUsd6: u(61.04), avgCostUsd6: u(219.8), pnlUsd6: u(3.06), pnlBps: 528 },
  tradable: { buy: true, sell: true },
  funds: { solanaUsdcUsd6: u(12), arcUsdcUsd6: u(50), maxBuyUsd6: u(61.9) },
  recent: [
    { kind: "buy", source: "market", at: "2026-11-09T09:12:00Z", qty: "0.1078", amountUsd6: u(25), link: `/buy/${SHOT_IDS.batch}` },
    { kind: "buy", source: "jar", at: "2026-11-08T04:30:00Z", qty: "0.156", amountUsd6: u(33.43), link: `/buy/${SHOT_IDS.batch}` },
  ],
};
const STEP: Record<ChartRange, [number, number]> = { "1D": [300, 288], "1W": [3600, 168], "1M": [14400, 180], "3M": [86400, 91], "1Y": [86400, 365], ALL: [86400, 500] };
export function candles(range: ChartRange): Candles {
  const [step, n] = STEP[range];
  const closes = walk(231.4 * (range === "1D" ? 0.986 : range === "1W" ? 0.95 : 0.8), n, n * 7 + step % 97, range === "1D" ? 0.00005 : 0.0006);
  const scale = 231.4 / closes[closes.length - 1];
  const now = Math.floor(Date.now() / 1000 / step) * step;
  return {
    range, interval: range === "1D" ? "5m" : range === "1W" ? "1h" : range === "1M" ? "4h" : "1d", source: "ownback", stale: false,
    candles: closes.map((c, i) => { const cc = c * scale, o = (i ? closes[i - 1] : c) * scale; return { t: now - (n - 1 - i) * step, o: u(o), h: u(Math.max(o, cc) * 1.002), l: u(Math.min(o, cc) * 0.998), c: u(cc) }; }),
  };
}
export const marketBuyReview = (amountUsd6: string): MarketBuyReview => {
  const amt = Number(amountUsd6) / 1e6;
  const row = { ...buyReview.rows[0], amountUsd6, estQty: (amt / 231.88).toFixed(4), price: { usd6PerUnit: u(231.88) }, refPriceUsd6: u(231.4), fees: { totalUsd6: u(amt * 0.0024), pctBps: 24, withinCap: true }, selectable: true };
  const bridge = Math.max(0, amt - 12);
  return { ...buyReview, quoteId: "00000000-0000-0000-0000-000000000001", expiresAt: new Date(Date.now() + 30_000).toISOString(), rows: [row], row, totalUsd6: amountUsd6, fees: row.fees, funding: { solanaUsdc6: u(12), arcUsdc6: u(50), bridgeUsd6: u(bridge) } };
};
export const sellReview = (pct = 50): SellReview => {
  const qty = (0.2638 * pct / 100).toFixed(4);
  const out = Number(qty) * 231.4 * 0.9978;
  return { assetId: "co:apple", name: "Apple", icon: logo("AAPLx"), token: "AAPLx", mint: marketDetail.mint, decimals: 8, heldQty: "0.2638", qty, amountRaw: "0",
    estUsdcUsd6: u(out), priceUsd6: u(231.4), fees: { totalUsd6: u(out * 0.0022), pctBps: 22 }, destination: "", costBasisUsd6: u(Number(qty) * 219.8), pnlUsd6: u(out - Number(qty) * 219.8) };
};
