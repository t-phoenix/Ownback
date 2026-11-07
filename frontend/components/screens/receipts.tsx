"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useApp } from "../app-context";
import { Monogram } from "../ui";
import { Empty, ErrorState, SkeletonList } from "../states";
import { api, type ReceiptRow as Row } from "../../lib/api";
import { useApi } from "../../lib/use-api";
import { toneFor } from "../../lib/assets";
import { fmtLocal, fmtUsd6 } from "../../lib/money";

const stateLabel: Record<Row["status"], string> = { bought: "Bought", in_jar: "In jars", needs_review: "Needs review", fallback: "Fallback" };

function shortDate(d: string) {
  const dt = new Date(`${d.slice(0, 10)}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? "" : dt.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function ReceiptRow({ r }: { r: Row }) {
  const { navigate } = useApp();
  const review = r.status === "needs_review";
  return <button className={`row receipt-row ${review ? "needs" : ""}`} onClick={() => navigate(`/add/${r.id}`)}>
    <Monogram name={r.shop} tone={toneFor(r.shop)} />
    <span className="row-main"><span className="row-title">{r.item || r.shop}</span><span className="row-sub">{[r.shop, shortDate(r.date), r.local.amount !== "0" ? fmtLocal(r.local.amount, r.local.currency) : ""].filter(Boolean).join(" · ")}</span></span>
    <span className="row-end"><span className="row-value">{fmtUsd6(r.investUsd6)}</span><span className={`row-sub ${review ? "warn-text" : ""}`}>{stateLabel[r.status]}</span></span>
  </button>;
}

function monthLabel(m: string) {
  const d = new Date(`${m}-01T00:00:00`);
  return Number.isNaN(d.getTime()) ? "Earlier" : d.toLocaleDateString([], { month: "long", year: "numeric" });
}

export function Receipts() {
  const { navigate } = useApp();
  const [f, setF] = useState<"all" | "needs_review" | "in_jars">("all");
  const [q, setQ] = useState("");
  const all = useApi("receipts:all", () => api.receipts("all"));
  const data = useApi(`receipts:${f}`, () => api.receipts(f));
  const reviewCount = useMemo(() => all.data?.groups.flatMap(g => g.rows).filter(r => r.status === "needs_review").length ?? 0, [all.data]);
  const groups = (data.data?.groups ?? []).map(g => ({ ...g, rows: g.rows.filter(r => `${r.item} ${r.shop}`.toLowerCase().includes(q.toLowerCase())) })).filter(g => g.rows.length);

  return <div className="page">
    <header className="page-head"><div><p className="kicker">Everything you've added</p><h1 className="h-page">Receipts</h1></div></header>
    <label className="search">
      <Search size={18} />
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search shops and items" aria-label="Search receipts" />
      {q && <button className="icon-btn sm" aria-label="Clear search" onClick={() => setQ("")}><X size={16} /></button>}
    </label>
    <div className="chips h-scroll" role="tablist" aria-label="Filter receipts">
      <button role="tab" aria-selected={f === "all"} className={`chip ${f === "all" ? "on" : ""}`} onClick={() => setF("all")}>All{all.data ? ` ${all.data.stats.count}` : ""}</button>
      <button role="tab" aria-selected={f === "needs_review"} className={`chip ${f === "needs_review" ? "on" : ""}`} onClick={() => setF("needs_review")}>Needs review {reviewCount > 0 && <span className="chip-count warn">{reviewCount}</span>}</button>
      <button role="tab" aria-selected={f === "in_jars"} className={`chip ${f === "in_jars" ? "on" : ""}`} onClick={() => setF("in_jars")}>In jars</button>
    </div>
    <ErrorState error={data.error} onRetry={data.reload} />
    {data.loading && <div className="block"><SkeletonList rows={4} /></div>}
    {data.data && !groups.length && (q
      ? <p className="empty">Nothing matches “{q}”.</p>
      : <Empty title={f === "all" ? "No receipts yet" : "Nothing here"} body={f === "all" ? "Add a purchase and it shows up here, with where your share went." : undefined}>
          {f === "all" && <button className="button primary" onClick={() => navigate("/add")}>Add a purchase</button>}
        </Empty>)}
    {groups.map(g => <section key={g.month} className="block"><p className="micro">{monthLabel(g.month)}</p><div className="card list">{g.rows.map(r => <ReceiptRow key={r.id} r={r} />)}</div></section>)}
  </div>;
}
