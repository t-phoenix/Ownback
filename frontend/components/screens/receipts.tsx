"use client";

import { useMemo, useRef, useState } from "react";
import { MoreHorizontal, Pencil, ReceiptText, Search, Trash2, X } from "lucide-react";
import { useApp } from "../app-context";
import { Monogram, Sheet, haptic } from "../ui";
import { Sticker } from "../stickers";
import { Empty, ErrorState, SkeletonList } from "../states";
import { api, ApiError, type ReceiptRow as Row } from "../../lib/api";
import { refreshAll, useApi } from "../../lib/use-api";
import { errorCopy } from "../../lib/copy";
import { toneFor } from "../../lib/assets";
import { fmtLocal, fmtUsd6 } from "../../lib/money";

const stateLabel: Record<Row["status"], string> = { bought: "Bought", in_jar: "In jars", needs_review: "Needs review", fallback: "Fallback" };

function shortDate(d: string) {
  const dt = new Date(`${d.slice(0, 10)}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? "" : dt.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function ReceiptRow({ r, onMenu }: { r: Row; onMenu?: (r: Row) => void }) {
  const { navigate } = useApp();
  const review = r.status === "needs_review";
  // Unread shops come back as "Receipt"; show the receipt icon, not "RE".
  const shop = /^receipts?$/i.test(r.shop?.trim() ?? "") ? "" : r.shop;
  // Long-press (phone) or right-click (laptop) opens the same menu as the ⋯ button.
  const press = useRef<ReturnType<typeof setTimeout>>(undefined);
  const held = useRef(false);
  const hold = () => { held.current = false; if (onMenu) press.current = setTimeout(() => { held.current = true; haptic(14); onMenu(r); }, 480); };
  const release = () => clearTimeout(press.current);
  return <div className={`receipt-item ${onMenu ? "has-menu" : ""}`}>
    <button className={`row receipt-row ${review ? "needs" : ""}`}
      onClick={() => { if (held.current) { held.current = false; return; } navigate(`/add/${r.id}`); }}
      onPointerDown={hold} onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
      onContextMenu={onMenu ? e => { e.preventDefault(); onMenu(r); } : undefined}>
      {shop ? <Monogram name={shop} tone={toneFor(shop)} /> : <span className="mini-icon"><ReceiptText size={20} /></span>}
      <span className="row-main"><span className="row-title">{r.item || shop || "Purchase"}</span><span className="row-sub">{[shop, shortDate(r.date), r.local.amount !== "0" ? fmtLocal(r.local.amount, r.local.currency) : ""].filter(Boolean).join(" · ")}</span></span>
      <span className="row-end"><span className="row-value">{fmtUsd6(r.investUsd6)}</span><span className={`row-sub ${review ? "warn-text" : ""}`}>{stateLabel[r.status]}</span></span>
    </button>
    {onMenu && <button className="icon-btn sm row-menu" aria-label={`Options for ${r.item || shop || "this receipt"}`} onClick={() => onMenu(r)}><MoreHorizontal size={18} /></button>}
  </div>;
}

/** Edit or delete one receipt. Delete is confirmed and says exactly what happens to the money. */
function ReceiptMenu({ r, onClose }: { r: Row | null; onClose: () => void }) {
  const { navigate, notify } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const close = () => { setConfirm(false); onClose(); };
  if (!r) return <Sheet open={false} onClose={close} title="">{null}</Sheet>;
  const bought = r.status === "bought";
  const del = async () => {
    setBusy(true);
    try { await api.deleteReceipt(r.id); haptic([8, 40, 8]); notify("Receipt deleted"); refreshAll(); close(); }
    catch (e) { notify(errorCopy(e instanceof ApiError ? e.code : undefined)); }
    finally { setBusy(false); }
  };
  return <Sheet open onClose={close} title={r.item || r.shop || "Receipt"}>
    {!confirm ? <>
      <div className="card list">
        <button className="row" disabled={bought} onClick={() => { close(); navigate(`/add/${r.id}?edit=1`); }}>
          <span className="mini-icon sm"><Pencil size={16} /></span>
          <span className="row-main"><span className="row-title">Edit details</span><span className="row-sub wrap">{bought ? "Already bought: your shares are yours, so this one stays as it is." : "Fix a wrong read. We'll match the companies again, then you confirm."}</span></span>
        </button>
        <button className="row danger" onClick={() => setConfirm(true)}>
          <span className="mini-icon sm"><Trash2 size={16} /></span>
          <span className="row-main"><span className="row-title">Delete receipt</span><span className="row-sub wrap">For duplicates or purchases you don't want counted.</span></span>
        </button>
      </div>
    </> : <>
      <p className="sub">Delete <b>{r.item || r.shop || "this receipt"}</b>? {r.status === "in_jar" ? `Its ${fmtUsd6(r.investUsd6)} in jars goes back to your free balance. ` : ""}{bought ? "The shares you bought stay in your wallet. " : ""}This can't be undone.</p>
      <div className="dock">
        <button className="button primary full danger-fill" disabled={busy} onClick={del}>{busy ? "Deleting…" : "Delete receipt"}</button>
        <button className="button quiet full" disabled={busy} onClick={() => setConfirm(false)}>Keep it</button>
      </div>
    </>}
  </Sheet>;
}

function monthLabel(m: string) {
  const d = new Date(`${m}-01T00:00:00`);
  return Number.isNaN(d.getTime()) ? "Earlier" : d.toLocaleDateString([], { month: "long", year: "numeric" });
}

export function Receipts() {
  const { navigate } = useApp();
  const [f, setF] = useState<"all" | "needs_review" | "in_jars">("all");
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<Row | null>(null);
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
      : <Empty title={f === "all" ? "No receipts yet" : "Nothing here"} art={f === "all" ? <Sticker id="receipt" size={96} /> : undefined} body={f === "all" ? "Add a purchase and it shows up here, with where your share went." : undefined}>
          {f === "all" && <button className="button primary" onClick={() => navigate("/add")}>Add a purchase</button>}
        </Empty>)}
    {groups.map(g => <section key={g.month} className="block"><p className="micro">{monthLabel(g.month)}</p><div className="card list">{g.rows.map(r => <ReceiptRow key={r.id} r={r} onMenu={setMenu} />)}</div></section>)}
    <ReceiptMenu r={menu} onClose={() => setMenu(null)} />
  </div>;
}
