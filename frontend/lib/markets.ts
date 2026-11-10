/** Markets display helpers. Money stays bigint/strings; floats appear only for drawing (sparklines, chart). */
import type { MarketItem, UsMarket, Usd6 } from "./api";
import { fmtUsd6 } from "./money";

const big = (v: Usd6 | null | undefined) => { try { return v == null || v === "" ? null : BigInt(v); } catch { return null; } };

/** Price per token: cents from $1 up; under $1, 4 significant decimals ("$0.004213"). */
export function fmtPrice(usd6: Usd6 | null | undefined): string {
  const n = big(usd6);
  if (n == null || n <= 0n) return "—";
  if (n >= 1_000_000n) return fmtUsd6(n);
  const s = n.toString().padStart(6, "0");
  const firstSig = s.search(/[1-9]/);
  const digits = Math.min(6, Math.max(2, firstSig + 4));
  return `$0.${s.slice(0, digits)}`;
}

/** Instant "≈ qty" for a dollar amount at the live price, before the real quote lands. Bigint, ≤ 6 decimals. */
export function estQty(usd6: Usd6 | null | undefined, priceUsd6: Usd6 | null | undefined): string | null {
  const a = big(usd6), p = big(priceUsd6);
  if (a == null || p == null || a <= 0n || p <= 0n) return null;
  const q = (a * 1_000_000n) / p; // 6-decimal fixed point
  if (q === 0n) return null;
  const s = q.toString().padStart(7, "0");
  return `${s.slice(0, -6)}.${s.slice(-6)}`.replace(/\.?0+$/, "");
}

/** 138 → "1.38%" (no sign; the ▲/▼ glyph carries it). */
export function fmtBps(bps: number): string {
  const a = Math.abs(bps);
  return `${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}%`;
}

/** "▲ 1.38%" / "▼ 0.82%" / "0.00%", plus the class for its colour. Colour is never the only signal. */
export function change(bps: number | null | undefined): { text: string; cls: "up" | "dn" | "flat" } | null {
  if (bps == null) return null;
  if (bps === 0) return { text: "0.00%", cls: "flat" };
  return bps > 0 ? { text: `▲ ${fmtBps(bps)}`, cls: "up" } : { text: `▼ ${fmtBps(bps)}`, cls: "dn" };
}

/** Signed Usd6 string ("-1810000") → "▲ $1.81" / "▼ $1.81". */
export function signedUsd(v: string | null | undefined): { text: string; cls: "up" | "dn" | "flat" } | null {
  if (v == null) return null;
  let n: bigint; try { n = BigInt(v); } catch { return null; }
  if (n === 0n) return { text: "$0.00", cls: "flat" };
  return n > 0n ? { text: `▲ ${fmtUsd6(n)}`, cls: "up" } : { text: `▼ ${fmtUsd6(-n)}`, cls: "dn" };
}

/** Big money ("$1.92M") for liquidity and volume. Display only. */
export function fmtCompact(usd6: Usd6 | null | undefined): string {
  const n = big(usd6);
  if (n == null) return "—";
  const d = n / 1_000_000n;
  if (d >= 1_000_000_000n) return `$${(Number(d / 10_000_000n) / 100).toFixed(2)}B`;
  if (d >= 1_000_000n) return `$${(Number(d / 10_000n) / 100).toFixed(2)}M`;
  if (d >= 1_000n) return `$${(Number(d / 10n) / 100).toFixed(1)}K`;
  return fmtUsd6(n);
}

export function ago(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** A price older than 2 min shows its age and goes muted. */
export const isStale = (iso: string | null | undefined, now = Date.now()) => !!iso && now - new Date(iso).getTime() > 120_000;

export const usMarketCopy: Record<UsMarket, string> = {
  open: "US market open",
  pre: "US pre-market",
  post: "US after-hours",
  closed: "US market closed",
};

/** SVG points for a sparkline; empty string when there's nothing to draw. */
export function sparkPoints(values: Usd6[], w = 48, h = 20): string {
  const nums = values.map(v => Number(v)).filter(n => Number.isFinite(n) && n > 0);
  if (nums.length < 2) return "";
  const min = Math.min(...nums), max = Math.max(...nums), span = max - min || 1;
  return nums.map((n, i) => `${((i / (nums.length - 1)) * w).toFixed(1)},${(h - 2 - ((n - min) / span) * (h - 4)).toFixed(1)}`).join(" ");
}

/** D39: a priced asset whose top pool holds under $10K (or reports none) is a thin market. */
export const THIN_LIQ_USD6 = 10_000_000_000n;
export const isThin = (i: { priceUsd6: Usd6 | null; liquidityUsd6: Usd6 | null }) =>
  i.priceUsd6 != null && (big(i.liquidityUsd6) ?? 0n) < THIN_LIQ_USD6;

export function filterMarkets(items: MarketItem[], q: string, chip: string, starred: Set<string>): MarketItem[] {
  const t = q.trim().toLowerCase();
  // ~70% of verified xStocks have no on-chain liquidity (Jupiter returns no price). Browse shows tradable ones;
  // search, Yours and Starred still find the rest (marked "No live price").
  const browse = !t && chip !== "yours" && chip !== "starred";
  return items.filter(i => {
    if (browse && i.priceUsd6 == null) return false;
    if (chip === "yours" && !i.held) return false;
    if (chip === "starred" && !starred.has(i.assetId)) return false;
    if (chip === "stock" || chip === "index" || chip === "commodity") { if (i.class !== chip) return false; }
    if (!t) return true;
    return i.name.toLowerCase().includes(t) || i.ticker.toLowerCase().includes(t) || i.token.toLowerCase().includes(t);
  });
}

export type Sort = "popular" | "gainers" | "losers" | "az";
export function sortMarkets(items: MarketItem[], sort: Sort): MarketItem[] {
  const out = [...items];
  if (sort === "az") return out.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "gainers" || sort === "losers") {
    const dir = sort === "gainers" ? -1 : 1;
    // Thin markets print fake moves (D39): they sort after liquid rows.
    return out.sort((a, b) => Number(isThin(a)) - Number(isThin(b)) || (a.change24hBps == null ? 1 : b.change24hBps == null ? -1 : dir * (a.change24hBps - b.change24hBps)));
  }
  return out; // server order = popular (pool liquidity)
}

const STAR = "ob:starred";
export function loadStarred(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STAR) || "[]") as string[]); } catch { return new Set(); }
}
export function saveStarred(s: Set<string>) { try { localStorage.setItem(STAR, JSON.stringify([...s])); } catch { /* blocked */ } }
