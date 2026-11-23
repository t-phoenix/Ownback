"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { Sheet, Spinner } from "./ui";
import { api, type ExchangeOption, type ExchangeQuotes } from "../lib/api";
import { errorCopy } from "../lib/copy";
import { fmtBps, fmtCompact } from "../lib/markets";
import { fmtUsd6 } from "../lib/money";

/** The buyer's exchange choice for one token. `best` = Jupiter over every exchange (the default). */
export type ExchangePick = { key: string; label: string; out?: string };
export const BEST: ExchangePick = { key: "best", label: "Best price" };

const codeOf = (e: unknown) => (e as { code?: string })?.code;

/**
 * D47 Compare exchanges: the same buy or sell quoted on the best route and on each exchange the token trades on,
 * exact figures (buys include the Ownback fee). Tapping a row picks it. The swap re-quotes when you sign.
 */
export function CompareExchanges({ open, onClose, assetId, side, amount, token, value, onPick }: {
  open: boolean; onClose: () => void; assetId: string; side: "buy" | "sell"; amount: string; token: string;
  value: string; onPick: (p: ExchangePick) => void;
}) {
  const [q, setQ] = useState<ExchangeQuotes | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !amount || amount === "0") return;
    let live = true;
    setQ(null); setErr(null);
    api.exchangeQuotes(assetId, side, amount).then(r => { if (live) setQ(r); }).catch(e => { if (live) setErr(errorCopy(codeOf(e))); });
    return () => { live = false; };
  }, [open, assetId, side, amount]);
  const unit = (o: ExchangeOption) => side === "buy" ? `${o.out} ${token}` : fmtUsd6(o.out);
  return <Sheet open={open} onClose={onClose} title="Compare exchanges">
    <p className="sub">{side === "buy" ? `What ${fmtUsd6(amount)} buys` : `What selling gets you`} on each exchange right now{q?.feeIncluded ? ", Ownback fee included" : ""}. Prices are checked again when you sign.</p>
    {!q && !err && <p className="sub"><Spinner /> Getting live quotes…</p>}
    {err && <p className="error" role="alert">{err}</p>}
    {q && <div className="tok-opts" role="radiogroup" aria-label="Where to trade">
      {q.options.map(o => {
        const on = o.key === value; const ok = !!o.outRaw && !o.tooCostly;
        return <button key={o.key} type="button" role="radio" aria-checked={on} className={`tok-opt${on ? " on" : ""}`} disabled={!ok}
          onClick={() => { onPick({ key: o.key, label: o.label, out: o.out }); onClose(); }}>
          <span className="tok-opt-top">
            {on && <Check size={16} aria-hidden="true" />}
            <b>{o.label}</b>
            {o.recommended && <span className="tok-rec">Recommended</span>}
            {ok ? <span className="num">{unit(o)}</span> : o.tooCostly ? <span className="sub">{unit(o)} · too costly</span> : <span className="sub">No quote right now</span>}
          </span>
          {o.tooCostly && o.diffBps != null && <span className="tok-opt-stats"><span>−{fmtBps(o.diffBps)} vs best: over the 5% limit, so it can't be picked</span></span>}
          {ok && <span className="tok-opt-stats">
            {o.key === "best" && <span>Any exchange{o.route?.length ? ` · now via ${o.route.join(" + ")}` : ""}</span>}
            {o.diffBps != null && o.diffBps < 0 && <span>−{fmtBps(o.diffBps)} vs best</span>}
            {o.impactBps != null && <span>Price impact {fmtBps(o.impactBps)}</span>}
            {o.liquidityUsd6 && <span>Liquidity {fmtCompact(o.liquidityUsd6)}</span>}
            {o.volume24hUsd6 && <span>24h vol {fmtCompact(o.volume24hUsd6)}</span>}
            {o.pools != null && <span>{o.pools} pool{o.pools === 1 ? "" : "s"}</span>}
          </span>}
        </button>;
      })}
    </div>}
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
