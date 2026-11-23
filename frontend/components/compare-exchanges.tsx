"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronRight, RefreshCw } from "lucide-react";
import { Sheet, Spinner } from "./ui";
import { api, type ExchangeOption, type ExchangeQuotes } from "../lib/api";
import { errorCopy } from "../lib/copy";
import { fmtBps, fmtCompact } from "../lib/markets";
import { fmtUsd6 } from "../lib/money";

/** The buyer's exchange choice for one token. `best` = Jupiter over every exchange (the default). */
export type ExchangePick = { key: string; label: string; out?: string };
export const BEST: ExchangePick = { key: "best", label: "Best price" };

const codeOf = (e: unknown) => (e as { code?: string })?.code;

// Last answer per asset, side and amount: reopening the sheet paints at once, then refreshes (server caches 15 s).
const memo = new Map<string, { at: number; q: ExchangeQuotes }>();
const FRESH_MS = 15_000;
const MAX_POLLS = 12;

/**
 * Loads the comparison and keeps polling while rows are still `pending` (the server answers what's ready within
 * about a second and finishes the rest in the background). Keeps the last answer on screen while refreshing.
 */
function useExchangeQuotes(open: boolean, assetId: string, side: "buy" | "sell", amount: string) {
  const key = `${assetId}:${side}:${amount}`;
  const [q, setQ] = useState<ExchangeQuotes | null>(() => memo.get(key)?.q ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const run = useRef(0);
  const load = useCallback(async (retry = false) => {
    const n = ++run.current;
    setErr(null); setLoading(true);
    try {
      for (let i = 0; i < MAX_POLLS; i++) {
        const r = await api.exchangeQuotes(assetId, side, amount, retry && i === 0);
        if (n !== run.current) return;
        setQ(r); memo.set(key, { at: Date.now(), q: r });
        if (r.complete) break;
        await new Promise(res => setTimeout(res, r.retryMs ?? 1_000));
        if (n !== run.current) return;
      }
    } catch (e) {
      if (n === run.current) setErr(errorCopy(codeOf(e)));
    } finally {
      if (n === run.current) setLoading(false);
    }
  }, [assetId, side, amount, key]);
  useEffect(() => {
    if (!open || !amount || amount === "0") return;
    const hit = memo.get(key);
    setQ(hit?.q ?? null);
    if (!hit || Date.now() - hit.at > FRESH_MS || !hit.q.complete) void load();
    return () => { run.current++; setLoading(false); }; // closing stops polling
  }, [open, key, amount, load]);
  return { q, err, loading, reload: load };
}

function ago(iso?: string) {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 5 ? "just now" : `${s} s ago`;
}

/**
 * D47 Compare exchanges: the same buy or sell quoted on the best route and on each exchange the token trades on,
 * exact figures (buys include the Ownback fee). Tapping a row picks it. The swap re-quotes when you sign.
 */
export function CompareExchanges({ open, onClose, assetId, side, amount, token, value, onPick }: {
  open: boolean; onClose: () => void; assetId: string; side: "buy" | "sell"; amount: string; token: string;
  value: string; onPick: (p: ExchangePick) => void;
}) {
  const { q, err, loading, reload } = useExchangeQuotes(open, assetId, side, amount);
  const unit = (o: ExchangeOption) => side === "buy" ? `${o.out} ${token}` : fmtUsd6(o.out);
  const pending = q?.options.filter(o => o.status === "pending").length ?? 0;
  const failed = q?.options.some(o => o.status === "error");
  const status = !q && loading ? "Getting live quotes…"
    : pending ? `Getting ${pending} more quote${pending === 1 ? "" : "s"}…`
    : loading ? "Refreshing…"
    : q ? `Updated ${ago(q.at)}` : "";
  return <Sheet open={open} onClose={onClose} title="Compare exchanges">
    <p className="sub">{side === "buy" ? `What ${fmtUsd6(amount)} buys` : `What selling gets you`} on each exchange right now{q?.feeIncluded ? ", Ownback fee included" : ""}. Prices are checked again when you sign.</p>
    <div className="exch-status" aria-live="polite">
      <span>{(loading || pending > 0) && <Spinner />} {status}</span>
      {q && !loading && <button type="button" className="link-button" onClick={() => void reload()}><RefreshCw size={13} aria-hidden="true" /> Refresh</button>}
    </div>
    {err && <p className="error" role="alert"><AlertTriangle size={14} /> {err} <button type="button" className="link-button" onClick={() => void reload(true)}>Try again</button></p>}
    {!q && loading && <div className="tok-opts" aria-hidden="true">{[0, 1, 2].map(i => <div key={i} className="tok-opt exch-skel"><span /><span /></div>)}</div>}
    {q && <div className="tok-opts" role="radiogroup" aria-label="Where to trade" aria-busy={pending > 0}>
      {q.options.map(o => {
        const on = o.key === value; const ok = o.status === "ok" && !!o.outRaw && !o.tooCostly;
        const right = o.status === "pending" ? <span className="sub"><Spinner /> Getting quote…</span>
          : o.status === "no_route" ? <span className="sub">No route here right now</span>
          : o.status === "error" ? <span className="sub">Couldn't reach the exchange</span>
          : o.tooCostly ? <span className="sub">{unit(o)} · too costly</span>
          : <span className="num">{unit(o)}</span>;
        return <button key={o.key} type="button" role="radio" aria-checked={on} className={`tok-opt${on ? " on" : ""}${o.status === "pending" ? " exch-pending" : ""}`} disabled={!ok}
          onClick={() => { onPick({ key: o.key, label: o.label, out: o.out }); onClose(); }}>
          <span className="tok-opt-top">
            {on && <Check size={16} aria-hidden="true" />}
            <b>{o.label}</b>
            {o.recommended && !pending && <span className="tok-rec">Recommended</span>}
            {right}
          </span>
          {o.tooCostly && o.diffBps != null && <span className="tok-opt-stats"><span>−{fmtBps(o.diffBps)} vs best: over the 5% limit, so it can't be picked</span></span>}
          <span className="tok-opt-stats">
            {ok && o.key === "best" && <span>Any exchange{o.route?.length ? ` · now via ${o.route.join(" + ")}` : ""}</span>}
            {ok && o.diffBps != null && o.diffBps < 0 && <span>−{fmtBps(o.diffBps)} vs best</span>}
            {ok && o.impactBps != null && <span>Price impact {fmtBps(o.impactBps)}</span>}
            {o.liquidityUsd6 && <span>Liquidity {fmtCompact(o.liquidityUsd6)}</span>}
            {o.volume24hUsd6 && <span>24h vol {fmtCompact(o.volume24hUsd6)}</span>}
            {o.pools != null && <span>{o.pools} pool{o.pools === 1 ? "" : "s"}</span>}
          </span>
        </button>;
      })}
    </div>}
    {failed && !loading && <p className="fineprint">Some exchanges didn't answer. <button type="button" className="link-button" onClick={() => void reload(true)}>Try them again</button></p>}
    {q?.exchangesUnknown && <p className="fineprint">The list of exchanges is still loading, so only the best price is shown. <button type="button" className="link-button" onClick={() => void reload()}>Check again</button></p>}
    {q && q.others.length > 0 && <p className="fineprint">Also trades on {q.others.map(x => `${x.label} (${fmtCompact(x.liquidityUsd6)})`).join(", ")}: too shallow to quote on its own, but the best route can still use it.</p>}
  </Sheet>;
}

/** The one-line route summary under a quote, with the link that opens Compare exchanges. */
export function ExchangeLine({ pick, route, unit, onOpen, disabled }: { pick: ExchangePick; route?: string[]; unit?: string; onOpen: () => void; disabled?: boolean }) {
  return <button type="button" className="link-button exch-line" disabled={disabled} onClick={onOpen}>
    {pick.key === "best" ? <>Best price{route?.length ? ` · via ${route.join(" + ")}` : ""}</> : <>On {pick.label} only{pick.out ? ` · ≈ ${pick.out}${unit ? ` ${unit}` : ""}` : ""}</>}
    <span className="exch-cta">Compare exchanges <ChevronRight size={14} aria-hidden="true" /></span>
  </button>;
}
