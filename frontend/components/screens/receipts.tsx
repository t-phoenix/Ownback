"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { useApp } from "../app-context";
import { Monogram } from "../ui";
import { receipts } from "../../lib/fixtures";
import type { Tone } from "../../lib/fixtures";

type R = typeof receipts[number];
const shopTone: Record<string, Tone> = { Croma: "green", Nike: "clay", Myntra: "mint", Nykaa: "gold", Amazon: "sky", Blinkit: "sage" };

export function ReceiptRow({ r }: { r: R }) {
  const { navigate } = useApp();
  const review = r.state === "Needs review";
  return <button className={`row receipt-row ${review ? "needs" : ""}`} onClick={() => navigate(review ? "/add/confirm" : "/receipts")}>
    <Monogram name={r.shop} tone={shopTone[r.shop] ?? "sage"} />
    <span className="row-main"><span className="row-title">{r.item}</span><span className="row-sub">{r.shop} · {r.date} · {r.local}</span></span>
    <span className="row-end"><span className="row-value">{r.saved}</span><span className={`row-sub ${review ? "warn-text" : ""}`}>{r.state}</span></span>
  </button>;
}

export function Receipts() {
  const [f, setF] = useState<"all" | "review" | "matched">("all");
  const [q, setQ] = useState("");
  const needs = receipts.filter(r => r.state === "Needs review").length;
  const list = receipts.filter(r => (f === "all" || (f === "review" ? r.state === "Needs review" : r.state === "Matched")) && `${r.item} ${r.shop}`.toLowerCase().includes(q.toLowerCase()));
  const recent = list.filter((_, i) => i < 3), earlier = list.filter((_, i) => i >= 3);
  return <div className="page">
    <header className="page-head"><div><p className="kicker">Everything you've added</p><h1 className="h-page">Receipts</h1></div></header>
    <label className="search">
      <Search size={18} />
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search shops and items" aria-label="Search receipts" />
      {q && <button className="icon-btn sm" aria-label="Clear search" onClick={() => setQ("")}><X size={16} /></button>}
    </label>
    <div className="chips h-scroll" role="tablist" aria-label="Filter receipts">
      <button role="tab" aria-selected={f === "all"} className={`chip ${f === "all" ? "on" : ""}`} onClick={() => setF("all")}>All 23</button>
      <button role="tab" aria-selected={f === "review"} className={`chip ${f === "review" ? "on" : ""}`} onClick={() => setF("review")}>Needs review <span className="chip-count warn">{needs}</span></button>
      <button role="tab" aria-selected={f === "matched"} className={`chip ${f === "matched" ? "on" : ""}`} onClick={() => setF("matched")}>Matched 21</button>
    </div>
    {!list.length && <p className="empty">Nothing matches “{q}”.</p>}
    {!!recent.length && <section className="block"><p className="micro">This week</p><div className="card list receipt-edge">{recent.map(r => <ReceiptRow key={r.id} r={r} />)}</div></section>}
    {!!earlier.length && <section className="block"><p className="micro">Earlier</p><div className="card list receipt-edge">{earlier.map(r => <ReceiptRow key={r.id} r={r} />)}</div></section>}
    <button className="button secondary full" style={{ marginTop: 24 }}>See 18 more</button>
  </div>;
}
