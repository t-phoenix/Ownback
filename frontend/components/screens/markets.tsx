"use client";

/**
 * Markets (docs/12-markets.md, D34–D37): the list (phone list / laptop table + preview), the asset page
 * with its chart, and the buy/sell panel. Buys go through POST /buys with a `market` quote (never jars);
 * sells through /sells. Every section fails on its own; prices never block a render.
 */
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { ArrowRight, ChevronRight, Copy, ExternalLink, Loader2, RefreshCw, Search, ShieldCheck, Star, WifiOff } from "lucide-react";
import { useApp } from "../app-context";
import { ConfirmAction, Monogram, Ring, Sheet, haptic, useMedia } from "../ui";
import { Empty, ErrorState, Skeleton, SkeletonList } from "../states";
import { api, ApiError, type Candle, type ChartRange, type MarketBuyReview, type MarketDetail, type MarketItem, type SellReview, type SignableAction, type SellSize } from "../../lib/api";
import { prefetchApi, refreshAll, useApi } from "../../lib/use-api";
import { errorCopy, marketCopy as copy } from "../../lib/copy";
import { isNoopAction, signAction, type StepUpdate } from "../../lib/sign-action";
import { assetName, toneFor } from "../../lib/assets";
import { fmtUsd6 } from "../../lib/money";
import { ago, change, fmtBps, fmtCompact, fmtPrice, filterMarkets, isStale, isThin, loadStarred, saveStarred, signedUsd, sortMarkets, sparkPoints, usMarketCopy, type Sort } from "../../lib/markets";
import { FlowHead } from "./home";
import { ArcPlan, dollarsToUsd6, usd6ToDollarsInput } from "./buy";
import type { Hover } from "../markets/price-chart-impl";

const PriceChart = dynamic(() => import("../markets/price-chart-impl"), { ssr: false, loading: () => <div className="skeleton chart-skel" /> });

const MIN_BUY_USD6 = 100_000n;
const codeOf = (e: unknown) => (e instanceof ApiError ? e.code : (e as { code?: string })?.code);
const bi = (v: string | null | undefined) => { try { return BigInt(v ?? 0); } catch { return 0n; } };
const open = (id: string) => `/markets/${encodeURIComponent(id)}`;

/** A failed section shows a small retry card; the rest of the page keeps working. */
class SectionBoundary extends Component<{ children: ReactNode; label?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="mk-failed" role="alert"><span>{copy.sectionFailed}</span>
      <button className="button quiet sm" onClick={() => this.setState({ error: null })}><RefreshCw size={14} /> Retry</button></div>;
  }
}

function Spark({ values, up }: { values: string[]; up: boolean | null }) {
  const pts = sparkPoints(values);
  return <svg className={`spark ${up == null ? "flat" : up ? "up" : "dn"}`} viewBox="0 0 48 20" aria-hidden="true">{pts && <polyline points={pts} />}</svg>;
}

function Pill({ bps }: { bps: number | null | undefined }) {
  const ch = change(bps);
  return ch ? <span className={`mk-pill ${ch.cls}`}>{ch.text}</span> : <span className="mk-pill flat">—</span>;
}

function useOnline() {
  const [on, setOn] = useState(true);
  useEffect(() => { const f = () => setOn(navigator.onLine); f(); addEventListener("online", f); addEventListener("offline", f); return () => { removeEventListener("online", f); removeEventListener("offline", f); }; }, []);
  return on;
}

/** Poll prices for the rows on screen only: one batched call every 15 s, paused when the tab is hidden. */
function useVisiblePrices() {
  const visible = useRef(new Set<string>());
  const [live, setLive] = useState<Record<string, { priceUsd6: string | null; priceAt: string | null; change24hBps: number | null }>>({});
  const io = useRef<IntersectionObserver | null>(null);
  // Created on first use: rows mount (and call `observe`) before effects run.
  const getIo = () => (io.current ??= new IntersectionObserver(es => {
    for (const e of es) { const id = (e.target as HTMLElement).dataset.id!; if (e.isIntersecting) visible.current.add(id); else visible.current.delete(id); }
  }, { rootMargin: "120px" }));
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible" || !visible.current.size) return;
      try { const r = await api.marketPrices([...visible.current].slice(0, 50)); setLive(prev => ({ ...prev, ...r.prices })); } catch { /* keep last */ }
    };
    const t = setInterval(tick, 15_000);
    return () => { clearInterval(t); io.current?.disconnect(); io.current = null; visible.current.clear(); };
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const observe = useCallback((node: HTMLElement | null) => { if (node) getIo().observe(node); }, []);
  return { live, observe };
}

function prefetchAsset(id: string) {
  prefetchApi(`market:${id}`, () => api.market(id));
  prefetchApi(`candles:${id}:1D`, () => api.candles(id, "1D"));
}

const CHIPS: [string, string][] = [["all", "All"], ["yours", "Yours"], ["starred", "Starred"], ["stock", "Stocks"], ["index", "Index funds"], ["commodity", "Commodities"]];
const SORTS: [Sort, string][] = [["popular", "Popular"], ["gainers", "Top gainers"], ["losers", "Top losers"], ["az", "A–Z"]];

// ─────────────────────────────── List ───────────────────────────────

export function Markets() {
  const { navigate } = useApp();
  const wide = useMedia("(min-width: 900px)");
  const online = useOnline();
  const m = useApi("markets", api.markets);
  const [q, setQ] = useState("");
  const [chip, setChip] = useState("all");
  const [sort, setSort] = useState<Sort>("popular");
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const { live, observe } = useVisiblePrices();
  useEffect(() => setStarred(loadStarred()), []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "/" && !(e.target as HTMLElement).closest("input, textarea")) { e.preventDefault(); search.current?.focus(); } };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, []);

  const items = useMemo(() => (m.data?.items ?? []).map(i => live[i.assetId] ? { ...i, ...live[i.assetId] } : i), [m.data, live]);
  const shown = useMemo(() => sortMarkets(filterMarkets(items, q, chip, starred), sort), [items, q, chip, starred, sort]);
  const held = items.filter(i => i.held);
  const star = (id: string) => { const s = new Set(starred); if (s.has(id)) s.delete(id); else s.add(id); setStarred(s); saveStarred(s); haptic(5); };
  const selected = shown.find(i => i.assetId === sel) ?? shown[0];

  const head = wide
    ? <header className="page-head"><div><p className="kicker">Buy and sell directly</p><h1 className="h-page">Markets</h1></div>{m.data && <span className={`mk-status ${m.data.usMarket}`}>{usMarketCopy[m.data.usMarket]}{m.data.usMarket !== "open" ? " · prices move 24/7 on-chain" : ""}</span>}</header>
    : <><FlowHead title="Markets" back="/" />{m.data && <span className={`mk-status ${m.data.usMarket}`}>{usMarketCopy[m.data.usMarket]}</span>}</>;

  const controls = <div className="mk-controls">
    <label className="mk-search"><Search size={16} /><input ref={search} id="mk-search" type="search" placeholder={`Search ${items.length || ""} assets: Apple, AAPL, gold…`} value={q} onChange={e => setQ(e.target.value)} aria-label="Search markets" />{wide && <kbd>/</kbd>}</label>
    <div className="mk-chips h-scroll" role="tablist" aria-label="Filter">
      {CHIPS.filter(([k]) => k !== "yours" || held.length).map(([k, label]) => <button key={k} role="tab" aria-selected={chip === k} className={`chip sm ${chip === k ? "on" : ""}`} onClick={() => setChip(k)}>{label}{k === "yours" ? ` · ${held.length}` : ""}</button>)}
    </div>
    <label className="mk-sort"><span className="sr-only">Sort</span>
      <select id="mk-sort" value={sort} onChange={e => setSort(e.target.value as Sort)}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    </label>
  </div>;

  const empty = m.data && !shown.length ? <Empty title={q ? copy.noMatch(q) : chip === "starred" ? "Nothing starred yet" : "Nothing here"} body={chip === "starred" ? "Tap the star on an asset to keep it here." : undefined} /> : null;

  return <div className={`page mk-page ${wide ? "wide" : "flow"}`}>
    {head}
    {!online && <div className="error-state"><WifiOff size={18} /><span>{copy.offline}</span></div>}
    {!m.data && <ErrorState error={m.error} onRetry={m.reload} />}
    {controls}
    {!m.data && m.loading && <SkeletonList rows={8} />}

    {!wide && held.length > 0 && chip === "all" && !q && <section className="block">
      <p className="micro">Your assets</p>
      <div className="mk-yours h-scroll">{held.map(i => { const ch = change(i.change24hBps); return <button key={i.assetId} className="mk-ycard" onClick={() => navigate(open(i.assetId))}>
        <span className="mk-ytoken">{i.token}</span><strong className="num">{fmtUsd6(i.positionUsd6)}</strong>{ch && <span className={`mk-ych ${ch.cls}`}>{ch.text}</span>}
      </button>; })}</div>
    </section>}

    {m.data && !q && chip === "all" && <p className="fineprint mk-count">{shown.length} with a live price · search to find all {items.length}</p>}
    {m.data && (wide ? <div className="mk-grid">
      <div className="card mk-table-wrap" tabIndex={0} aria-label="Markets table. Arrow keys move, Enter opens."
        onKeyDown={e => {
          const i = shown.findIndex(x => x.assetId === selected?.assetId);
          if (e.key === "ArrowDown" && i < shown.length - 1) { e.preventDefault(); setSel(shown[i + 1].assetId); }
          if (e.key === "ArrowUp" && i > 0) { e.preventDefault(); setSel(shown[i - 1].assetId); }
          if (e.key === "Enter" && selected) navigate(open(selected.assetId));
        }}>
        <table className="mk-table">
          <thead><tr><th>Asset</th><th className="r">Price</th><th className="r">24h</th><th className="r">24h trend</th><th className="r">Liquidity</th><th className="r">Your position</th><th><span className="sr-only">Star</span></th></tr></thead>
          <tbody>{shown.map(i => { const name = assetName(i.assetId, i.name); const stale = isStale(i.priceAt); return <tr key={i.assetId} data-id={i.assetId} ref={observe} className={selected?.assetId === i.assetId ? "sel" : ""}
            onClick={() => { setSel(i.assetId); prefetchAsset(i.assetId); }} onDoubleClick={() => navigate(open(i.assetId))} onMouseEnter={() => prefetchAsset(i.assetId)}>
            <td><span className="mk-an"><Monogram name={name} icon={i.icon} tone={toneFor(i.assetId)} size={30} /><span><b>{name}</b> <span className="muted">{i.token}{i.priceUsd6 == null ? " · No live price" : isThin(i) ? <> · <span className="mk-thin">{copy.thin}</span></> : ""}</span></span></span></td>
            <td className={`r num ${stale || isThin(i) ? "muted" : ""}`}>{fmtPrice(i.priceUsd6)}</td>
            <td className="r"><Pill bps={i.change24hBps} /></td>
            <td className="r"><Spark values={i.spark} up={i.change24hBps == null ? null : i.change24hBps >= 0} /></td>
            <td className="r num">{fmtCompact(i.liquidityUsd6)}</td>
            <td className="r num">{i.positionUsd6 ? fmtUsd6(i.positionUsd6) : <span className="muted">—</span>}</td>
            <td><button className={`mk-star ${starred.has(i.assetId) ? "on" : ""}`} aria-label={starred.has(i.assetId) ? `Unstar ${name}` : `Star ${name}`} aria-pressed={starred.has(i.assetId)} onClick={e => { e.stopPropagation(); star(i.assetId); }}><Star size={16} /></button></td>
          </tr>; })}</tbody>
        </table>
        {empty}
      </div>
      {selected && <SectionBoundary><Preview key={selected.assetId} item={selected} /></SectionBoundary>}
    </div> : <div className="card list mk-list">
      {shown.map(i => { const name = assetName(i.assetId, i.name); const stale = isStale(i.priceAt); return <button key={i.assetId} data-id={i.assetId} ref={observe} className="row mk-row" onClick={() => navigate(open(i.assetId))} onTouchStart={() => prefetchAsset(i.assetId)}>
        <Monogram name={name} icon={i.icon} tone={toneFor(i.assetId)} size={36} />
        <span className="row-main"><span className="row-title">{name}</span><span className="row-sub">{i.token}{i.priceUsd6 == null ? " · No live price" : isThin(i) ? <> · <span className="mk-thin">{copy.thin}</span></> : stale ? ` · ${ago(i.priceAt)}` : ""}</span></span>
        <Spark values={i.spark} up={i.change24hBps == null ? null : i.change24hBps >= 0} />
        <span className="row-end"><span className={`row-value num ${stale || isThin(i) ? "muted" : ""}`}>{fmtPrice(i.priceUsd6)}</span><Pill bps={i.change24hBps} /></span>
      </button>; })}
      {empty}
    </div>)}
    <p className="fineprint mk-legal">{copy.legal}</p>
  </div>;
}

/** Laptop · the selected row: price, a 1D line, your position, and Buy / Sell. */
function Preview({ item }: { item: MarketItem }) {
  const { navigate } = useApp();
  const name = assetName(item.assetId, item.name);
  const c = useApi(`candles:${item.assetId}:1D`, () => api.candles(item.assetId, "1D"));
  const d = useApi(`market:${item.assetId}`, () => api.market(item.assetId));
  const pts = c.data?.candles.length ? sparkPoints(c.data.candles.map(k => k.c), 240, 70) : "";
  return <aside className="card mk-preview">
    <div className="mk-an"><Monogram name={name} icon={item.icon} tone={toneFor(item.assetId)} size={36} /><span><b>{name}</b><br /><span className="muted">{item.token} · Solana</span></span></div>
    <div><div className="mk-big num">{fmtPrice(item.priceUsd6)}</div><Pill bps={item.change24hBps} /> <span className="muted small">today</span></div>
    {pts ? <svg viewBox="0 0 240 70" className={`mk-mini ${item.change24hBps != null && item.change24hBps < 0 ? "dn" : "up"}`} aria-label="Price, last day"><polyline points={pts} /></svg> : <div className="skeleton" style={{ height: 70 }} />}
    {isThin(item) && <p className="callout small">{copy.thinHint}</p>}
    <dl className="mk-lines">
      {d.data?.position && <><div><dt>You own</dt><dd className="num">{d.data.position.qty} · {fmtUsd6(d.data.position.valueUsd6)}</dd></div>
        {d.data.position.pnlUsd6 != null && (() => { const s = signedUsd(d.data.position.pnlUsd6); return s ? <div><dt>Return</dt><dd className={`num ${s.cls}`}>{s.text}</dd></div> : null; })()}</>}
      <div><dt>Liquidity</dt><dd className="num">{fmtCompact(item.liquidityUsd6)}</dd></div>
    </dl>
    <div className="dock-row">
      {item.held && <button className="button secondary" onClick={() => navigate(`${open(item.assetId)}?trade=sell`)}>Sell</button>}
      <button className="button primary" onClick={() => navigate(`${open(item.assetId)}?trade=buy`)}>Buy</button>
    </div>
    <button className="link center" onClick={() => navigate(open(item.assetId))}>Open full page <ChevronRight size={15} /></button>
  </aside>;
}

// ─────────────────────────────── Asset page ───────────────────────────────

const RANGES: ChartRange[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];
const rangeWord: Record<ChartRange, string> = { "1D": "today", "1W": "past week", "1M": "past month", "3M": "past 3 months", "1Y": "past year", ALL: "all time" };

/** The chart ends at the live price, so the line and the big number agree. */
function withLive(candles: Candle[], live: string | null | undefined): Candle[] {
  const last = candles[candles.length - 1];
  if (!last || !live || bi(live) <= 0n) return candles;
  const v = bi(live);
  return [...candles.slice(0, -1), { ...last, c: live, h: bi(last.h) > v ? last.h : live, l: bi(last.l) < v ? last.l : live }];
}

export function MarketAsset({ id, trade }: { id: string; trade?: "buy" | "sell" }) {
  const { navigate } = useApp();
  const wide = useMedia("(min-width: 900px)");
  const d = useApi(`market:${id}`, () => api.market(id));
  const p = useApi(`mprice:${id}`, () => api.marketPrices([id]), { pollMs: 10_000 });
  const [range, setRange] = useState<ChartRange>("1D");
  const [kind, setKind] = useState<"area" | "candles">("area");
  const c = useApi(`candles:${id}:${range}`, () => api.candles(id, range));
  const lastCandles = useRef<Candle[]>([]);
  if (c.data?.candles.length) lastCandles.current = c.data.candles;
  const [hover, setHover] = useState<Hover>(null);
  const [sheet, setSheet] = useState<"buy" | "sell" | null>(trade ?? null);
  const [starred, setStarred] = useState(false);
  useEffect(() => setStarred(loadStarred().has(id)), [id]);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 5_000); return () => clearInterval(t); }, []);

  const md = d.data;
  const livePx = p.data?.prices[id];
  const price = livePx?.priceUsd6 ?? md?.priceUsd6 ?? null;
  const priceAt = livePx?.priceAt ?? md?.priceAt ?? null;
  const candles = useMemo(() => withLive(c.data?.candles.length ? c.data.candles : lastCandles.current, price), [c.data, price]);
  const name = assetName(id, md?.name);

  if (d.error && !md && (d.error.code === "NOT_FOUND" || d.error.code === "FEATURE_OFF")) {
    return <div className="page flow narrow"><FlowHead title="Markets" back="/markets" />
      <Empty title={copy.notListed} body="Only tokens we've verified on-chain are listed."><button className="button primary" onClick={() => navigate("/markets")}>Browse Markets</button></Empty></div>;
  }

  // Change for the chosen range: 24h from the server for 1D, else first open → live price.
  const rangeBps = range === "1D" ? (livePx?.change24hBps ?? md?.change24hBps ?? null)
    : candles.length > 1 && bi(candles[0].o) > 0n ? Number(((bi(price ?? candles[candles.length - 1].c) - bi(candles[0].o)) * 10_000n) / bi(candles[0].o)) : null;
  const shown = hover ? hover.c : price;
  const delta = (() => {
    if (hover && candles.length) { const first = bi(candles[0].o); return first > 0n ? Number(((bi(hover.c) - first) * 10_000n) / first) : null; }
    return rangeBps;
  })();
  const ch = change(delta);
  const toggleStar = () => { const s = loadStarred(); if (s.has(id)) s.delete(id); else s.add(id); saveStarred(s); setStarred(s.has(id)); haptic(5); };

  const priceBlock = <div className="mk-priceblock">
    {md ? <div className="mk-hero num">{shown ? fmtPrice(shown) : copy.priceUnavailable}</div> : <span className="skeleton" style={{ width: 180, height: 40 }} />}
    <div className="mk-sub">
      {ch && <span className={`mk-delta ${ch.cls}`}>{ch.text}</span>}
      <span className="muted">{hover ? new Date(hover.t * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : rangeWord[range]}</span>
      {!hover && priceAt && Date.now() - new Date(priceAt).getTime() > 10_000 && <span className={`muted small ${isStale(priceAt) ? "warn" : ""}`}>· {isStale(priceAt) ? `Price from ${ago(priceAt)}` : `Updated ${ago(priceAt)}`}</span>}
    </div>
  </div>;

  const chart = <section className="card mk-chart" aria-label={`${name} price chart`}>
    {c.data?.reason === "not_enough_history" ? <div className="mk-chart-empty"><strong>{copy.noHistory}</strong></div>
      : c.data?.reason === "upstream" && !candles.length ? <div className="mk-chart-empty"><strong>{copy.chartDown}</strong><span>{copy.chartDownSub}</span></div>
      : candles.length > 1 ? <div className={c.loading ? "mk-chart-dim" : ""}><PriceChart candles={candles} kind={kind} onHover={setHover} height={wide ? 340 : 240} /></div>
      : <div className="skeleton chart-skel" />}
    <div className="mk-ranges" role="tablist" aria-label="Chart range">
      {RANGES.map(r => <button key={r} role="tab" aria-selected={range === r} className={range === r ? "on" : ""} onClick={() => { setRange(r); setHover(null); }}>{r === "ALL" ? "All" : r}</button>)}
      <button className="mk-kind" onClick={() => setKind(k => k === "area" ? "candles" : "area")} aria-label={`Show ${kind === "area" ? "candles" : "line"}`}>{kind === "area" ? "Candles" : "Line"}</button>
    </div>
    {c.data?.stale && candles.length > 1 && <p className="fineprint">Showing the last saved chart.</p>}
  </section>;

  const position = md?.position && <section className="card mk-pos">
    <div><span>You own</span><b className="num">{md.position.qty} {md.token}</b></div>
    <div><span>Value</span><b className="num">{fmtUsd6(md.position.valueUsd6)}</b></div>
    <div><span>Avg cost</span><b className="num">{bi(md.position.avgCostUsd6) > 0n ? fmtPrice(md.position.avgCostUsd6) : "—"}</b></div>
    <div><span>Return</span>{(() => { const s = signedUsd(md.position.pnlUsd6); return s ? <b className={`num ${s.cls}`}>{s.text}{md.position.pnlBps != null ? ` · ${fmtBps(md.position.pnlBps)}` : ""}</b> : <b>—</b>; })()}</div>
    <button className="link" onClick={() => navigate(`/holdings/${encodeURIComponent(id)}`)}>In Holdings <ChevronRight size={15} /></button>
  </section>;

  const stats = md && <section className="card mk-stats">
    <div><span>Liquidity</span><b className="num">{fmtCompact(md.liquidityUsd6)}</b></div>
    <div><span>24h volume</span><b className="num">{fmtCompact(md.volume24hUsd6)}</b></div>
    <div><span>Issuer</span><b>{md.issuer === "xStocks" ? "Backed (xStocks)" : md.issuer}</b></div>
    <div className="wide"><span>Mint</span><button className="mono mk-copy" onClick={() => navigator.clipboard?.writeText(md.mint).catch(() => {})} aria-label="Copy mint address">{md.mint.slice(0, 4)}…{md.mint.slice(-4)} <Copy size={13} /></button></div>
    <div><span>Decimals</span><b className="num">{md.decimals}</b></div>
    <div><span>Chain</span><b>Solana</b></div>
  </section>;

  const about = md && <section className="mk-about">
    <p className="sub">Tracks {name}{md.ticker ? ` (${md.ticker})` : ""}. Issued by Backed as an xStock on Solana. <a className="link-inline" href={md.links.mint} target="_blank" rel="noreferrer">Solscan <ExternalLink size={12} /></a></p>
    {isThin(md) && <p className="callout">{copy.thinHint}</p>}
    {md.usMarket !== "open" && <p className="callout">{usMarketCopy[md.usMarket]}. {copy.closedHint}</p>}
  </section>;

  const recent = md && md.recent.length > 0 && <section className="block">
    <h2 className="h-section">Your trades</h2>
    <div className="card list">{md.recent.map((t, i) => <button key={i} className="row" onClick={() => navigate(t.link)}>
      <span className="row-main"><span className="row-title">{t.kind === "buy" ? "Bought" : "Sold"} {t.qty} {md.token}</span>
        <span className="row-sub">{new Date(t.at).toLocaleDateString([], { day: "numeric", month: "short" })} · {t.source === "jar" ? "From jar" : "Market"}</span></span>
      <span className="row-end"><span className="row-value num">{fmtUsd6(t.amountUsd6)}</span></span><ChevronRight size={16} className="row-chev" />
    </button>)}</div>
  </section>;

  const panel = md && <TradePanel d={md} mode={sheet ?? "buy"} setMode={m => setSheet(m)} livePrice={price} />;

  return <div className={`page mk-asset ${wide ? "wide" : "flow"}`}>
    <header className="mk-head">
      <button className="icon-btn" aria-label="Back" onClick={() => navigate("/markets", { dir: "back" })}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg></button>
      <Monogram name={name} icon={md?.icon} tone={toneFor(id)} size={40} />
      <div className="row-main"><h1 className="mk-title">{name}</h1><span className="row-sub">{md ? `${md.token} · Solana` : " "}</span></div>
      {md && md.usMarket !== "open" && wide && <span className={`mk-status ${md.usMarket}`}>{usMarketCopy[md.usMarket]}</span>}
      <button className={`icon-btn sm mk-star ${starred ? "on" : ""}`} aria-label={starred ? "Unstar" : "Star"} aria-pressed={starred} onClick={toggleStar}><Star size={18} /></button>
    </header>
    <ErrorState error={md ? null : d.error} onRetry={d.reload} />
    <div className={wide ? "mk-asset-grid" : ""}>
      <div className="mk-col">
        <SectionBoundary>{priceBlock}</SectionBoundary>
        <SectionBoundary>{chart}</SectionBoundary>
        {!wide && <SectionBoundary>{position}</SectionBoundary>}
        <SectionBoundary>{stats}</SectionBoundary>
        <SectionBoundary>{about}</SectionBoundary>
        <SectionBoundary>{recent}</SectionBoundary>
        {!md && d.loading && <Skeleton h={160} />}
        <p className="fineprint mk-legal">{copy.legal}</p>
      </div>
      {wide && <div className="mk-side"><SectionBoundary>{position}</SectionBoundary><SectionBoundary><div className="card mk-panel">{panel}</div></SectionBoundary></div>}
    </div>
    {!wide && md && <div className="mk-dock">
      {md.position && <button className="button secondary" onClick={() => setSheet("sell")}>Sell</button>}
      <button className="button primary" disabled={!md.tradable.buy} onClick={() => setSheet("buy")}>{md.tradable.buy ? "Buy" : md.tradable.reason === "relay_off" ? copy.relayOff : copy.notTradable}</button>
    </div>}
    {!wide && <Sheet open={!!sheet && !!md} onClose={() => setSheet(null)} title={`${sheet === "sell" ? "Sell" : "Buy"} ${name}`}>{panel}</Sheet>}
  </div>;
}

// ─────────────────────────────── Trade panel ───────────────────────────────

const BUY_CHIPS = ["5", "10", "25", "50"];
const PCTS = [25, 50, 75, 100] as const;
const QUOTE_EVERY_S = 15;

function TradePanel({ d, mode, setMode, livePrice }: { d: MarketDetail; mode: "buy" | "sell"; setMode: (m: "buy" | "sell") => void; livePrice: string | null }) {
  const canSell = !!d.position;
  return <div className="mk-trade">
    <div className="segmented" role="tablist" aria-label="Buy or sell">
      <button role="tab" aria-selected={mode === "buy"} className={mode === "buy" ? "on" : ""} onClick={() => setMode("buy")}>Buy</button>
      <button role="tab" aria-selected={mode === "sell"} className={mode === "sell" ? "on" : ""} disabled={!canSell} onClick={() => setMode("sell")}>Sell</button>
    </div>
    {mode === "sell" && canSell ? <SellForm d={d} livePrice={livePrice} /> : <BuyForm d={d} />}
  </div>;
}

/** Re-runs `fn` when `key` changes (after `ms` quiet) and every `everyS` seconds while `enabled`. Returns seconds to next refresh. */
function useDebouncedQuote(key: string, enabled: boolean, fn: () => void, ms = 500, everyS = QUOTE_EVERY_S) {
  const f = useRef(fn); f.current = fn;
  const [left, setLeft] = useState(everyS);
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => { f.current(); setLeft(everyS); }, ms);
    return () => clearTimeout(t);
  }, [key, enabled, ms, everyS]);
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setLeft(s => { if (s <= 1) { if (document.visibilityState === "visible") f.current(); return everyS; } return s - 1; }), 1000);
    return () => clearInterval(t);
  }, [enabled, everyS]);
  return left;
}

function BuyForm({ d }: { d: MarketDetail }) {
  const { navigate } = useApp();
  const [amt, setAmt] = useState("10.00");
  const [review, setReview] = useState<MarketBuyReview | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [phase, setPhase] = useState<"idle" | "starting" | "review" | "arc" | "submitting">("idle");
  const [arcPlan, setArcPlan] = useState<{ batchId: string; action: Extract<SignableAction, { kind: "evm_calls" }> } | null>(null);
  const [steps, setSteps] = useState<StepUpdate[]>([]);
  const [err, setErr] = useState<ReactNode>(null);
  const [note, setNote] = useState<string | null>(null);
  const usd6 = dollarsToUsd6(amt);
  const max = bi(d.funds.maxBuyUsd6);
  const local: ReactNode = !amt.trim() ? null
    : usd6 == null ? copy.enterAmount
    : bi(usd6) < MIN_BUY_USD6 ? copy.minBuy
    : bi(usd6) > max ? <>{copy.haveFree(fmtUsd6(max))} <button className="link-inline" onClick={() => navigate("/funds")}>Add funds</button></> : null;
  const valid = !!usd6 && !local;
  const idle = phase === "idle";

  const quote = useCallback(async () => {
    if (!usd6) return;
    setQuoting(true);
    try { const r = await api.marketBuyReview(d.assetId, usd6); setReview(r); setErr(null); }
    catch (e) {
      const code = codeOf(e); const det = e instanceof ApiError ? (e.details as Record<string, string> | undefined) : undefined;
      setReview(null);
      setErr(code === "UPSTREAM" ? copy.noRoute : code === "INSUFFICIENT_FREE" && det?.availableUsd6 ? copy.haveFree(fmtUsd6(det.availableUsd6)) : code === "RATE_LIMITED" ? errorCopy(code) : errorCopy(code));
    } finally { setQuoting(false); }
  }, [d.assetId, usd6]);
  const left = useDebouncedQuote(`${usd6}`, valid && idle && d.tradable.buy, quote);

  const row = review?.row;
  const feesHigh = row && !row.selectable && row.reason === "fees_high";
  const noVenue = row && !row.selectable && row.reason === "no_venue";
  const fresh = review && usd6 && review.row.amountUsd6 === usd6;
  const fail = (e: unknown) => {
    const code = codeOf(e);
    setPhase("idle"); setArcPlan(null);
    if (code === "QUOTE_EXPIRED" || code === "PRICE_MOVED") { setNote(copy.priceMoved); void quote(); return; }
    setErr(code === "CHALLENGE_FAILED" ? copy.cancelled : code === "KEEPER_DISABLED" ? copy.relayOff : errorCopy(code));
  };
  const go = (batchId: string) => { navigate(`/buy/${batchId}`); refreshAll(); };
  const buy = async () => {
    if (!review) return;
    setErr(null); setNote(null); setSteps([]); setPhase("starting");
    try {
      const start = await api.buy(review.quoteId);
      if (start.action?.kind === "evm_calls" && !isNoopAction(start.action)) { setArcPlan({ batchId: start.batchId, action: start.action }); setPhase("review"); return; }
      if (start.action) { setPhase("arc"); const s = await signAction(start.action); setPhase("submitting"); await api.buyArcSubmitted(start.batchId, s.txHash!); }
      go(start.batchId);
    } catch (e) { fail(e); }
  };
  const runArc = async () => {
    if (!arcPlan) return;
    setErr(null); setPhase("arc");
    try {
      const signed = await signAction(arcPlan.action, { headless: true, onStep: st => setSteps(prev => [...prev.filter(x => x.index !== st.index), st].sort((a, b) => a.index - b.index)) });
      setPhase("submitting");
      await api.buyArcSubmitted(arcPlan.batchId, signed.txHash!);
      go(arcPlan.batchId);
    } catch (e) { fail(e); }
  };
  const arcLabels = arcPlan ? arcPlan.action.calls.map((_, i) => arcPlan.action.labels?.[i] ?? `Step ${i + 1}`) : [];
  const arcDone = steps.filter(x => x.state === "done").length;
  const phaseLabel = phase === "starting" ? "Preparing…" : phase === "review" ? "Waiting for your approval…" : phase === "arc" ? "Signing on Arc…" : phase === "submitting" ? "Checking Arc receipt…" : null;

  if (!d.tradable.buy) return <p className="error left" role="alert">{d.tradable.reason === "relay_off" ? copy.relayOff : copy.noRoute}</p>;

  return <div className="mk-form">
    <label className="mk-amount" htmlFor="mk-buy-amt"><span className="sr-only">Amount in US dollars</span>
      <span className="mk-cur">$</span><input id="mk-buy-amt" inputMode="decimal" autoComplete="off" value={amt} disabled={!idle} onChange={e => { setAmt(e.target.value.replace(/[^\d.]/g, "")); setNote(null); }} />
    </label>
    <p className="mk-est num">{row && fresh && row.selectable ? `≈ ${row.estQty} ${row.token ?? d.token}` : quoting ? "Getting a price…" : " "}</p>
    <div className="mk-chips-row">{BUY_CHIPS.map(v => <button key={v} className={`chip sm ${amt === `${v}.00` ? "on" : ""}`} disabled={!idle} onClick={() => setAmt(`${v}.00`)}>${v}</button>)}
      <button className={`chip sm ${usd6 === d.funds.maxBuyUsd6 ? "on" : ""}`} disabled={!idle || max < MIN_BUY_USD6} onClick={() => setAmt(usd6ToDollarsInput(d.funds.maxBuyUsd6))}>Max</button></div>
    {local && <p className="error left" role="alert">{local}</p>}
    {!local && row && fresh && <dl className="mk-lines">
      <div><dt>Price</dt><dd className="num">{fmtPrice(row.price.usd6PerUnit)} per {row.token ?? d.token}</dd></div>
      <div><dt>Fees</dt><dd className="num">{fmtUsd6(row.fees.totalUsd6)} · {fmtBps(row.fees.pctBps)}</dd></div>
      <div><dt>Pays from</dt><dd className="num">{bi(review!.funding.bridgeUsd6) > 0n
        ? `${fmtUsd6((bi(review!.totalUsd6) - bi(review!.funding.bridgeUsd6)).toString())} Solana + ${fmtUsd6(review!.funding.bridgeUsd6)} from Arc` : "Your Solana USDC"}</dd></div>
      <div><dt>Lands in</dt><dd>Your Solana wallet</dd></div>
    </dl>}
    {feesHigh && <p className="error left" role="alert">{copy.feesOver(fmtBps(row!.fees.pctBps))} <button className="link-inline" onClick={() => navigate("/settings")}>Change fee limit</button></p>}
    {noVenue && <p className="error left" role="alert">{copy.noRoute}</p>}
    {err && <p className="error left" role="alert">{err}</p>}
    {note && <p className="callout">{note}</p>}
    {valid && idle && review && <div className="live small"><Ring value={(left / QUOTE_EVERY_S) * 100} size={22} stroke={3} /><span>New price in <b className="num">{left} s</b></span></div>}
    <div className="dock">
      {phaseLabel ? <button className="button primary full lg" disabled><Loader2 size={16} className="spin" /> {phaseLabel}</button>
        : valid && row?.selectable && fresh ? <ConfirmAction label={`Buy ${fmtUsd6(usd6)}`} onConfirm={buy} />
        : <button className="button primary full lg" disabled>{quoting ? <><Loader2 size={16} className="spin" /> Getting a price…</> : `Buy ${usd6 ? fmtUsd6(usd6) : ""}`}</button>}
      <p className="fineprint center"><ShieldCheck size={14} /> You sign every step. Nothing moves without you.</p>
    </div>
    <Sheet open={!!arcPlan} onClose={() => { if (phase === "review") { setArcPlan(null); setPhase("idle"); } }} title={`Approve ${arcLabels.length} step${arcLabels.length > 1 ? "s" : ""} on Arc`}>
      <p className="sub">Moves {fmtUsd6(review?.funding.bridgeUsd6)} of your Arc USDC to your own Solana wallet, then buys {d.token}. You approve once here; your wallet then signs each step in order.</p>
      <ArcPlan labels={arcLabels} steps={steps} />
      {phase === "review" ? <div className="dock">
        <button className="button primary full lg" onClick={() => { haptic(10); void runArc(); }}>Approve and start <ArrowRight size={18} /></button>
        <button className="button quiet full" onClick={() => { setArcPlan(null); setPhase("idle"); }}>Cancel</button>
      </div> : <div className="dock"><button className="button primary full lg" disabled><Loader2 size={16} className="spin" /> {phase === "submitting" ? "Checking Arc receipt…" : `Step ${Math.min(arcDone + 1, arcLabels.length)} of ${arcLabels.length}…`}</button></div>}
    </Sheet>
  </div>;
}

function SellForm({ d, livePrice }: { d: MarketDetail; livePrice: string | null }) {
  const { navigate } = useApp();
  const [by, setBy] = useState<"usd" | "qty">("usd");
  const [input, setInput] = useState("");
  const [pct, setPct] = useState<SellSize["pct"]>(50);
  const [review, setReview] = useState<SellReview | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [phase, setPhase] = useState<"idle" | "building" | "signing" | "submitting">("idle");
  const [err, setErr] = useState<string | null>(null);
  const size: SellSize | null = pct ? { pct }
    : by === "usd" ? (dollarsToUsd6(input) ? { usd6: dollarsToUsd6(input)! } : null)
    : /^\d+(\.\d+)?$/.test(input.trim()) ? { qty: input.trim() } : null;
  const key = JSON.stringify(size);
  const quote = useCallback(async () => {
    if (!size) return;
    setQuoting(true);
    try { setReview(await api.sellsReview(d.assetId, size)); setErr(null); }
    catch (e) { setReview(null); const code = codeOf(e); setErr(code === "VALIDATION" && d.position ? copy.haveQty(d.position.qty, d.token) : code === "UPSTREAM" ? copy.noRoute : errorCopy(code)); }
    finally { setQuoting(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.assetId, key]);
  const left = useDebouncedQuote(key, !!size && phase === "idle", quote);
  const sell = async () => {
    if (!review) return;
    setErr(null); setPhase("building");
    try {
      const start = await api.sell(d.assetId, review.qty, "market");
      if (start.action) { setPhase("signing"); const s = await signAction(start.action); setPhase("submitting"); await api.sellSubmit(start.sellId, s.signedTx!); }
      refreshAll(); navigate(`/sell/${start.sellId}`);
    } catch (e) { const code = codeOf(e); setErr(code === "CHALLENGE_FAILED" ? copy.cancelled : errorCopy(code)); setPhase("idle"); void quote(); }
  };
  const label = phase === "building" ? "Getting the best route…" : phase === "signing" ? "Approve in wallet…" : phase === "submitting" ? "Confirming on Solana…" : null;
  const pnl = signedUsd(review?.pnlUsd6);
  return <div className="mk-form">
    <div className="segmented sm" role="tablist" aria-label="Sell by">
      <button role="tab" aria-selected={by === "usd"} className={by === "usd" ? "on" : ""} onClick={() => { setBy("usd"); setPct(undefined); setInput(review ? usd6ToDollarsInput(review.estUsdcUsd6) : ""); }}>$ amount</button>
      <button role="tab" aria-selected={by === "qty"} className={by === "qty" ? "on" : ""} onClick={() => { setBy("qty"); setPct(undefined); setInput(review?.qty ?? ""); }}>Quantity</button>
    </div>
    <label className="mk-amount" htmlFor="mk-sell-amt"><span className="sr-only">{by === "usd" ? "Dollars to sell" : `${d.token} to sell`}</span>
      {by === "usd" && <span className="mk-cur">$</span>}
      <input id="mk-sell-amt" inputMode="decimal" autoComplete="off" disabled={phase !== "idle"}
        value={pct ? (by === "usd" ? (review ? usd6ToDollarsInput(review.estUsdcUsd6) : "") : review?.qty ?? "") : input}
        placeholder={by === "usd" ? "0.00" : "0"} onChange={e => { setPct(undefined); setInput(e.target.value.replace(/[^\d.]/g, "")); }} />
      {by === "qty" && <span className="mk-cur">{d.token}</span>}
    </label>
    <p className="mk-est num">{review ? `${review.qty} of your ${review.heldQty} ${d.token}` : quoting ? "Getting a price…" : " "}</p>
    <div className="mk-chips-row">{PCTS.map(p => <button key={p} className={`chip sm ${pct === p ? "on" : ""}`} disabled={phase !== "idle"} onClick={() => setPct(p)}>{p === 100 ? "Max" : `${p}%`}</button>)}</div>
    {review && <dl className="mk-lines">
      <div><dt>You get</dt><dd className="num">≈ {fmtUsd6(review.estUsdcUsd6)} USDC</dd></div>
      <div><dt>Fees</dt><dd className="num">{fmtUsd6(review.fees.totalUsd6)} · {fmtBps(review.fees.pctBps)}</dd></div>
      {pnl && <div><dt>Return on this part</dt><dd className={`num ${pnl.cls}`}>{pnl.text}</dd></div>}
      {livePrice && <div><dt>Price</dt><dd className="num">{fmtPrice(livePrice)} per {d.token}</dd></div>}
    </dl>}
    {err && <p className="error left" role="alert">{err}</p>}
    {review && phase === "idle" && <div className="live small"><Ring value={(left / QUOTE_EVERY_S) * 100} size={22} stroke={3} /><span>New price in <b className="num">{left} s</b></span></div>}
    <p className="fineprint">{copy.sellNote}</p>
    <div className="dock">
      {label ? <button className="button primary full lg" disabled><Loader2 size={16} className="spin" /> {label}</button>
        : review ? <ConfirmAction label={`Sell · ${fmtUsd6(review.estUsdcUsd6)}`} onConfirm={sell} />
        : <button className="button primary full lg" disabled>{quoting ? "Getting a price…" : "Sell"}</button>}
    </div>
  </div>;
}
