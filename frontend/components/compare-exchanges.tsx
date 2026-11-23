"use client";

import { useEffect, useSyncExternalStore } from "react";
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

/*
 * One shared store for every comparison (asset, side, amount), outside React: reopening the sheet, a parent re-render
 * or a re-quote never refetches or resets what is on screen. The server caches each row too (15 s), so polls are cheap.
 */
type Entry = { q: ExchangeQuotes | null; at: number; err: string | null; loading: boolean };
const EMPTY: Entry = { q: null, at: 0, err: null, loading: false };
const store = new Map<string, Entry>();
const subs = new Set<() => void>();
const busy = new Set<string>();
const watching = new Map<string, number>(); // open sheets per key: polling stops when none is open
const FRESH_MS = 15_000;
const MAX_POLLS = 15;
const keyOf = (assetId: string, side: string, amount: string) => `${assetId}:${side}:${amount}`;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function put(k: string, patch: Partial<Entry>) {
  store.set(k, { ...(store.get(k) ?? EMPTY), ...patch });
  if (store.size > 60) for (const [x, v] of store) if (Date.now() - v.at > 5 * 60_000 && !busy.has(x)) store.delete(x);
  subs.forEach(f => f());
}

/** Fetches (once per key at a time) and keeps polling while rows are pending and a sheet is open. */
async function load(assetId: string, side: "buy" | "sell", amount: string, retry = false) {
  const k = keyOf(assetId, side, amount);
  if (busy.has(k)) return;
  busy.add(k); put(k, { loading: true });
  try {
    for (let i = 0; i < MAX_POLLS; i++) {
      const r = await api.exchangeQuotes(assetId, side, amount, retry && i === 0);
      put(k, { q: r, at: Date.now(), err: null });
      if (r.complete || !watching.get(k)) break;
      await sleep(r.retryMs ?? 1_000);
      if (!watching.get(k)) break;
    }
  } catch (e) {
    put(k, { err: errorCopy(codeOf(e)) });
  } finally {
    busy.delete(k); put(k, { loading: false });
  }
}

/** Starts the comparison before the sheet opens (one request; the server finishes the quotes in the background). */
export function prefetchExchangeQuotes(assetId: string, side: "buy" | "sell", amount: string) {
  if (!amount || amount === "0") return;
  const hit = store.get(keyOf(assetId, side, amount));
  if (hit?.q && Date.now() - hit.at < FRESH_MS) return;
  void load(assetId, side, amount);
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

function useExchangeQuotes(open: boolean, assetId: string, side: "buy" | "sell", amount: string) {
  const k = keyOf(assetId, side, amount);
  const e = useSyncExternalStore(subscribe, () => store.get(k) ?? EMPTY, () => EMPTY);
  useEffect(() => {
    if (!open || !amount || amount === "0") return;
    watching.set(k, (watching.get(k) ?? 0) + 1);
    const hit = store.get(k);
    // A prefetch still running picks up the open sheet and keeps polling by itself.
    if (!hit?.q || Date.now() - hit.at > FRESH_MS || !hit.q.complete) void load(assetId, side, amount);
    return () => { watching.set(k, Math.max(0, (watching.get(k) ?? 1) - 1)); };
  }, [open, k, assetId, side, amount]);
  return { ...e, reload: (retry = false) => load(assetId, side, amount, retry) };
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
    : q?.exchangesUnknown && loading ? "Finding the exchanges it trades on…"
    : pending && loading ? `Getting ${pending} more quote${pending === 1 ? "" : "s"}…`
    : pending ? `${pending} quote${pending === 1 ? " is" : "s are"} slow to answer`
    : loading ? "Refreshing…"
    : q ? `Updated ${ago(q.at)}` : "";
  return <Sheet open={open} onClose={onClose} title="Compare exchanges">
    <p className="sub">{side === "buy" ? `What ${fmtUsd6(amount)} buys` : `What selling gets you`} on each exchange right now{q?.feeIncluded ? ", Ownback fee included" : ""}. Prices are checked again when you sign.</p>
    <div className="exch-status" aria-live="polite">
      <span><span className="exch-spin">{loading && <Spinner />}</span>{status}</span>
      {q && <button type="button" className="link-button" disabled={loading} onClick={() => void reload()}><RefreshCw size={13} aria-hidden="true" /> Refresh</button>}
    </div>
    {err && !q && <p className="error" role="alert"><AlertTriangle size={14} /> {err} <button type="button" className="link-button" onClick={() => void reload(true)}>Try again</button></p>}
    {!q && loading && <div className="tok-opts" aria-hidden="true">{[0, 1, 2].map(i => <div key={i} className="tok-opt exch-skel"><span /><span /></div>)}</div>}
    {q && <div className="tok-opts" role="radiogroup" aria-label="Where to trade" aria-busy={pending > 0}>
      {q.options.map(o => {
        const on = o.key === value; const ok = o.status === "ok" && !!o.outRaw && !o.tooCostly;
        const right = o.status === "pending" ? <span className="sub">{loading ? "Getting quote…" : "Waiting…"}</span>
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
    {err && q && <p className="fineprint" role="alert">{err} Showing the last answer.</p>}
    {failed && !loading && <p className="fineprint">Some exchanges didn't answer. <button type="button" className="link-button" onClick={() => void reload(true)}>Try them again</button></p>}
    {q?.exchangesUnknown && !loading && <p className="fineprint">The list of exchanges is still loading, so only the best price is shown. <button type="button" className="link-button" onClick={() => void reload()}>Check again</button></p>}
    {q && q.others.length > 0 && <p className="fineprint">Also trades on {q.others.map(x => `${x.label} (${fmtCompact(x.liquidityUsd6)})`).join(", ")}: too shallow to quote on its own, but the best route can still use it.</p>}
  </Sheet>;
}

/**
 * The one-line route summary under a quote, with the link that opens Compare exchanges. `prefetch` starts the
 * comparison on hover, focus or touch; `eager` also starts it once the quote has settled (single-asset screens).
 */
export function ExchangeLine({ pick, route, unit, onOpen, disabled, prefetch }: {
  pick: ExchangePick; route?: string[]; unit?: string; onOpen: () => void; disabled?: boolean;
  prefetch?: { assetId: string; side: "buy" | "sell"; amount: string; eager?: boolean };
}) {
  const warm = () => { if (prefetch) prefetchExchangeQuotes(prefetch.assetId, prefetch.side, prefetch.amount); };
  const { assetId, side, amount, eager } = prefetch ?? {};
  useEffect(() => {
    if (!eager || disabled || !assetId || !side || !amount) return;
    const t = setTimeout(() => prefetchExchangeQuotes(assetId, side, amount), 800);
    return () => clearTimeout(t);
  }, [eager, disabled, assetId, side, amount]);
  return <button type="button" className="link-button exch-line" disabled={disabled} onClick={onOpen} onPointerEnter={warm} onPointerDown={warm} onFocus={warm}>
    {pick.key === "best" ? <>Best price{route?.length ? ` · via ${route.join(" + ")}` : ""}</> : <>On {pick.label} only{pick.out ? ` · ≈ ${pick.out}${unit ? ` ${unit}` : ""}` : ""}</>}
    <span className="exch-cta">Compare exchanges <ChevronRight size={14} aria-hidden="true" /></span>
  </button>;
}
