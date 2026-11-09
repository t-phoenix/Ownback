/**
 * Wireframe demo numbers (docs/03). Used only by /shots for presentable screenshots.
 * shortcut: fixture-only, replace with live seed when demo user has real data
 */
import type {
  Balance, BuyProgress, BuyReview, GmailState, Home, Holdings, Jars, Me, Purchase, Receipts, Rules,
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
    { assetId: "co:apple", name: "Apple", subtitle: "Maker · AAPLx", qty: "0.18", token: "AAPLx", chain: "solana", valueUsd6: u(42.5) },
    { assetId: "co:tsmc", name: "TSMC", subtitle: "Behind · TSMXx", qty: "0.04", token: "TSMXx", chain: "solana", valueUsd6: u(8.2) },
    { assetId: "mat:gold", name: "Gold", subtitle: "Material", qty: "0.002", token: "GLDx", chain: "solana", valueUsd6: u(5.1) },
  ],
  recentReceipts: [
    { id: SHOT_IDS.purchase, shop: "Croma", item: "iPhone 16 Pro", local: { amount: "79900", currency: "INR" }, amountUsd6: u(955), date: "2026-11-06", status: "in_jar", investUsd6: u(47.75) },
    { id: "airpods", shop: "Apple Store", item: "AirPods Pro", local: { amount: "24900", currency: "INR" }, amountUsd6: u(297.63), date: "2026-11-05", status: "bought", investUsd6: u(14.88) },
  ],
  nextBuy: { at: "2026-11-09T04:30:00.000Z", readyJars: 2 },
};

export const jars: Jars = {
  jars: [
    { assetId: "co:apple", name: "Apple", role: "maker", amountUsd6: u(33.43), readyMinUsd6: u(5), state: "ready", token: "AAPLx", price: { usd6PerUnit: u(236.41), at: "2026-11-09T10:00:00Z", source: "jupiter" } },
    { assetId: "co:tsmc", name: "TSMC", role: "supplier", amountUsd6: u(3.18), readyMinUsd6: u(5), state: "filling", token: "TSMXx", price: { usd6PerUnit: u(205.1), at: "2026-11-09T10:00:00Z", source: "jupiter" } },
    { assetId: "co:qualcomm", name: "Qualcomm", role: "supplier", amountUsd6: u(3.18), readyMinUsd6: u(5), state: "filling" },
    { assetId: "co:corning", name: "Corning", role: "supplier", amountUsd6: u(3.19), readyMinUsd6: u(5), state: "filling" },
    { assetId: "mat:gold", name: "Gold", role: "material", amountUsd6: u(2.39), readyMinUsd6: u(5), state: "filling" },
    { assetId: "mat:silver", name: "Silver", role: "material", amountUsd6: u(2.38), readyMinUsd6: u(5), state: "filling" },
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
    { assetId: "co:apple", name: "Apple", role: "maker", tokenized: true, amountUsd6: u(33.43), selected: true, why: "Made the iPhone." },
    { assetId: "co:tsmc", name: "TSMC", role: "supplier", tokenized: true, amountUsd6: u(3.18), selected: true, why: "Fabricates the A18 chip." },
    { assetId: "co:qualcomm", name: "Qualcomm", role: "supplier", tokenized: true, amountUsd6: u(3.18), selected: true, why: "Modem and RF." },
    { assetId: "co:corning", name: "Corning", role: "supplier", tokenized: true, amountUsd6: u(3.19), selected: true, why: "Ceramic Shield glass." },
    { assetId: "mat:gold", name: "Gold", role: "material", tokenized: true, amountUsd6: u(2.39), selected: true, why: "Bond wires and connectors." },
    { assetId: "mat:silver", name: "Silver", role: "material", tokenized: true, amountUsd6: u(2.38), selected: true, why: "Conductive paste." },
  ],
  ogRequestIds: ["0g_req_croma_iphone_7nov"],
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
    { assetId: "co:apple", name: "Apple", status: "bought", amountUsd6: u(33.43), spentUsd6: u(33.41), fillPriceUsd6: u(236.12), qty: "0.1415" },
    { assetId: "co:tsmc", name: "TSMC", status: "bought", amountUsd6: u(5.12), spentUsd6: u(5.11), fillPriceUsd6: u(197.9), qty: "0.0258" },
  ],
  destination: "AbhiSo1111111111111111111111111111111",
};

export const holdings: Holdings = {
  balance,
  sections: [
    {
      key: "stocksCommodities", totalUsd6: u(59.1),
      rows: [
        { assetId: "co:apple", name: "Apple", subtitle: "0.18 AAPLx · Solana", qty: "0.18", token: "AAPLx", chain: "solana", valueUsd6: u(42.5), price: { usd6PerUnit: u(236.41), at: "2026-11-09T10:00:00Z", source: "jupiter" } },
        { assetId: "co:tsmc", name: "TSMC", subtitle: "0.04 TSMXx · Solana", qty: "0.04", token: "TSMXx", chain: "solana", valueUsd6: u(8.2), price: { usd6PerUnit: u(205.1), at: "2026-11-09T10:00:00Z", source: "jupiter" } },
        { assetId: "co:qualcomm", name: "Qualcomm", subtitle: "0.02 QCOMx · Solana", qty: "0.02", token: "QCOMx", chain: "solana", valueUsd6: u(3.3), price: { usd6PerUnit: u(165.02), at: "2026-11-09T10:00:00Z", source: "jupiter" } },
        { assetId: "mat:gold", name: "Gold", subtitle: "0.002 GLDx · Solana", qty: "0.002", token: "GLDx", chain: "solana", valueUsd6: u(5.1), price: { usd6PerUnit: u(2551.3), at: "2026-11-09T10:00:00Z", source: "jupiter" } },
      ],
    },
    {
      key: "stablecoins", totalUsd6: u(175.1),
      rows: [{ assetId: "usdc", name: "USDC on Arc", subtitle: "Free to buy with", chain: "arc", valueUsd6: u(175.1) }],
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

export const SCREENS = ["signin", "home", "confirm", "jars", "buy-review", "buy-done", "holdings", "receipts", "settings", "type-it"] as const;
export type ShotScreen = (typeof SCREENS)[number];
