"use client";

import { Component, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useApp } from "./app-context";
import { Monogram } from "./ui";
import { useApi } from "../lib/use-api";
import { api, type MarketItem } from "../lib/api";
import { assetName, toneFor } from "../lib/assets";
import { change, fmtPrice, usMarketCopy } from "../lib/markets";
import { marketsOn } from "../lib/flags";

const MOVER_MIN_LIQ = 50_000_000_000n; // $50K in Usd6

/** Never let the card take Home down with it. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Home · top 3 movers among priced assets (D34). Shares the Markets list cache. */
function Card() {
  const { navigate } = useApp();
  const m = useApi("markets", api.markets);
  const movers = (m.data?.items ?? [])
    // Thin pools (some hold $1) print absurd moves; movers only come from pools with ≥ $50K.
    .filter((i): i is MarketItem & { change24hBps: number } => i.change24hBps != null && i.priceUsd6 != null && BigInt(i.liquidityUsd6 ?? 0) >= MOVER_MIN_LIQ)
    .sort((a, b) => Math.abs(b.change24hBps) - Math.abs(a.change24hBps))
    .slice(0, 3);
  if (m.error && !m.data) return null; // Home never shows a Markets error; the Markets screen does
  return <section className="card markets-card" aria-labelledby="mk-card">
    <div className="block-head tight">
      <h2 id="mk-card" className="h-card">Markets</h2>
      {m.data && <span className={`mk-status ${m.data.usMarket}`}>{usMarketCopy[m.data.usMarket]}</span>}
    </div>
    {!m.data ? <div aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="mk-mover"><span className="skeleton" style={{ width: 32, height: 32, borderRadius: 10 }} /><span className="skeleton" style={{ width: "50%", height: 13 }} /></div>)}</div>
      : movers.map(i => { const ch = change(i.change24hBps); const name = assetName(i.assetId, i.name); return <button key={i.assetId} className="mk-mover" onClick={() => navigate(`/markets/${encodeURIComponent(i.assetId)}`)}>
        <Monogram name={name} icon={i.icon} tone={toneFor(i.assetId)} size={32} />
        <span className="row-main"><span className="row-title">{name}</span><span className="row-sub">{i.token}</span></span>
        <span className="mk-price num">{fmtPrice(i.priceUsd6)}</span>
        {ch && <span className={`mk-pill ${ch.cls}`}>{ch.text}</span>}
      </button>; })}
    <button className="link" onClick={() => navigate("/markets")}>See all markets <ChevronRight size={15} /></button>
  </section>;
}

export function MarketsCard() {
  if (!marketsOn) return null;
  return <Quiet><Card /></Quiet>;
}
