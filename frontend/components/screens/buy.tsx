"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Share2, ShieldCheck, Zap } from "lucide-react";
import { useApp } from "../app-context";
import { Coin3D, ConfirmAction, GlassJar, Monogram, Ring, Sheet, haptic } from "../ui";
import { Empty, ErrorState, Skeleton, SkeletonList } from "../states";
import { api, ApiError, type Jar } from "../../lib/api";
import { useApi, refreshAll } from "../../lib/use-api";
import { errorCopy } from "../../lib/copy";
import { signAction } from "../../lib/sign-action";
import { assetName, toneFor } from "../../lib/assets";
import { fmtUsd6, pct } from "../../lib/money";
import { FlowHead } from "./home";

export function Jars() {
  const { navigate } = useApp();
  const j = useApi("jars", api.jars);
  const [sheet, setSheet] = useState<Jar | null>(null);
  const press = useRef<ReturnType<typeof setTimeout>>(undefined);
  const jars = j.data?.jars ?? [];
  const ready = jars.filter(x => x.state === "ready"), other = jars.filter(x => x.state !== "ready");
  const readyTotal = ready.reduce((s, x) => s + BigInt(x.amountUsd6), 0n);
  const holdStart = (x: Jar) => { press.current = setTimeout(() => { haptic(14); setSheet(x); }, 450); };
  const holdEnd = () => clearTimeout(press.current);

  const card = (x: Jar) => {
    const p = pct(BigInt(x.amountUsd6), BigInt(x.readyMinUsd6)); const isReady = x.state === "ready";
    const name = assetName(x.assetId, x.name);
    const left = BigInt(x.readyMinUsd6) - BigInt(x.amountUsd6);
    return <button key={x.assetId} className={`jar-card ${isReady ? "ready" : ""}`}
      onClick={() => (isReady ? navigate("/buy/review") : setSheet(x))}
      onPointerDown={() => holdStart(x)} onPointerUp={holdEnd} onPointerLeave={holdEnd}
      onContextMenu={e => { e.preventDefault(); setSheet(x); }}
      aria-label={`${name} jar, ${fmtUsd6(x.amountUsd6)}. ${isReady ? "Ready, tap to buy" : "Filling"}. Long-press for options`}>
      <GlassJar pct={p} ready={isReady} size={74} />
      <span className="jar-name"><Monogram name={name} tone={toneFor(x.assetId)} size={22} /> {name}</span>
      <span className="jar-amt">{fmtUsd6(x.amountUsd6)}</span>
      <span className={`jar-state ${isReady ? "pos" : ""}`}>{isReady ? "Ready · tap to buy" : x.state === "no_venue" ? "Buys when available" : `Filling · ${fmtUsd6(left > 0n ? left : 0n)} to go`}</span>
    </button>;
  };

  return <div className="page flow wide">
    <FlowHead title="Your jars" back="/" />
    <p className="lede left">Dollars wait in your vault on Arc. When a jar reaches {fmtUsd6(jars[0]?.readyMinUsd6 ?? "5000000")} we'll remind you on Sunday. Nothing buys without your OK.</p>
    <ErrorState error={j.error} onRetry={j.reload} />
    {j.loading && <div className="jar-grid block">{[0, 1, 2].map(i => <Skeleton key={i} h={200} />)}</div>}
    {j.data && !jars.length && <Empty title="No jars yet" body="Confirm a purchase and its share lands in a jar for each company.">
      <button className="button primary" onClick={() => navigate("/add")}>Add a purchase</button>
    </Empty>}

    {!!ready.length && <section className="block">
      <div className="block-head"><h2 className="h-section"><Zap size={16} /> {ready.length} ready to buy</h2><strong className="num">{fmtUsd6(readyTotal)}</strong></div>
      <div className="jar-grid">{ready.map(card)}</div>
    </section>}
    {!!other.length && <section className="block">
      <div className="block-head"><h2 className="h-section">Filling</h2><span className="sub">Long-press a jar for options</span></div>
      <div className="jar-grid">{other.map(card)}</div>
    </section>}

    {!!ready.length && <div className="dock sticky">
      <button className="button primary full lg" onClick={() => navigate("/buy/review")}>Review and buy {ready.length} jar{ready.length > 1 ? "s" : ""} <ArrowRight size={18} /></button>
    </div>}

    <Sheet open={!!sheet} onClose={() => setSheet(null)} title={sheet ? `${assetName(sheet.assetId, sheet.name)} jar` : ""}>
      {sheet && <>
        <div className="sheet-jar"><GlassJar pct={pct(BigInt(sheet.amountUsd6), BigInt(sheet.readyMinUsd6))} ready={sheet.state === "ready"} size={64} /><div><strong className="num big">{fmtUsd6(sheet.amountUsd6)}</strong><p className="sub">{sheet.state === "ready" ? "Ready · tap to buy" : "Filling · fills from your next purchases"}</p></div></div>
        <button className="button primary full" onClick={() => { setSheet(null); navigate(sheet.state === "ready" ? "/buy/review" : "/buy/review?all"); }}>{sheet.state === "ready" ? "Review and buy" : "Buy now anyway"}</button>
      </>}
    </Sheet>
  </div>;
}

export function BuyReview({ all = false }: { all?: boolean }) {
  const { navigate } = useApp();
  const r = useApi(`review:${all}`, () => api.buysReview(all));
  const [left, setLeft] = useState(30);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!r.data) return;
    const end = new Date(r.data.expiresAt).getTime();
    const t = setInterval(() => { const s = Math.max(0, Math.round((end - Date.now()) / 1000)); setLeft(s); if (s === 0) r.reload(); }, 1000);
    return () => clearInterval(t);
  }, [r.data, r]);
  const d = r.data;
  const rows = d?.rows ?? [];
  const selectable = rows.filter(x => x.selectable);
  const buy = async () => {
    if (!d) return;
    setBusy(true); setErr(null);
    try {
      const signed = await signAction({ kind: "typed_data", typedData: d.approval.typedData, summary: `Buy ${selectable.length} assets` });
      const { batchIds } = await api.buy(d.quoteId, d.approval.typedData, signed.signature ?? "");
      refreshAll(); navigate(`/buy/${batchIds[0]}`);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : (e as { code?: string }).code;
      setErr(errorCopy(code ?? "BAD_SIGNATURE")); setBusy(false);
      if (code === "QUOTE_EXPIRED") r.reload();
    }
  };
  return <div className="page flow wide">
    <FlowHead title={rows.length ? `Buy ${selectable.length || rows.length} jar${rows.length > 1 ? "s" : ""}` : "Buy"} back="/jars" />
    <ErrorState error={r.error} onRetry={r.reload} />
    {d && <div className="live"><Ring value={(left / 30) * 100} size={30} stroke={3} /><span>Prices update live · next in <b className="num">{left} s</b></span></div>}
    {r.loading && <SkeletonList rows={3} />}
    {d && <div className="two-col">
      <div className="quotes">
        {rows.map(q => { const name = assetName(q.assetId, q.name); return <article className={`card quote ${q.selectable ? "" : "off"}`} key={q.assetId}>
          <header className="quote-top">
            <Monogram name={name} tone={toneFor(q.assetId)} />
            <div className="row-main"><div className="row-title">{name} {q.token && <span className="sub">{q.token}</span>}</div><div className="row-sub">{q.selectable ? `Best price on ${q.chain === "solana" ? "Solana" : q.chain}` : q.reason === "fees_high" ? `Fees too high (${(q.fees.pctBps / 100).toFixed(1)}%)` : "Buys when available"}</div></div>
            <strong className="num">{fmtUsd6(q.amountUsd6)}</strong>
          </header>
          {BigInt(q.price.usd6PerUnit || "0") > 0n && <dl className="quote-grid">
            <div><dt>Price now</dt><dd>{fmtUsd6(q.price.usd6PerUnit)}{q.token ? ` per ${q.token}` : ""}</dd></div>
            <div><dt>You get about</dt><dd>{q.estQty} {q.token}</dd></div>
            <div><dt>Won't buy above</dt><dd>{fmtUsd6(q.maxPriceUsd6)} (+1%)</dd></div>
            <div><dt>Fees</dt><dd>{fmtUsd6(q.fees.totalUsd6)} ({(q.fees.pctBps / 100).toFixed(1)}%)</dd></div>
          </dl>}
        </article>; })}
      </div>
      <div>
        <section className="card summary">
          <div className="summary-line"><span>From your jars</span><strong>{fmtUsd6(d.totalUsd6)}</strong></div>
          <div className="summary-line"><span>Fees</span><strong>{fmtUsd6(d.fees.totalUsd6)} ({(d.fees.pctBps / 100).toFixed(1)}%)</strong></div>
          <p className="sub">Price protection 1% · if the price moves more, that jar waits</p>
        </section>
        {d.destination && <p className="fineprint">Shares go straight to your Solana wallet <span className="mono">{d.destination.slice(0, 4)}…{d.destination.slice(-4)}</span>.</p>}
        {err && <p className="error" role="alert">{err}</p>}
        <div className="dock">
          {busy ? <button className="button primary full lg" disabled>Approving…</button>
            : selectable.length ? <ConfirmAction label={`Buy now · ${fmtUsd6(d.totalUsd6)}`} onConfirm={buy} />
            : <button className="button primary full lg" disabled>Nothing can be bought right now</button>}
          <p className="fineprint center"><ShieldCheck size={14} /> Nothing buys without this approval.</p>
        </div>
      </div>
    </div>}
  </div>;
}

export function BuyDone({ batchId }: { batchId: string }) {
  const { navigate } = useApp();
  const b = useApi(`buy:${batchId}`, () => api.buyProgress(batchId), { pollMs: 2000 });
  useEffect(() => { haptic([12, 60, 12, 60, 24]); }, []);
  const d = b.data;
  const finished = d && /^done/.test(d.status);
  const bought = d?.entries.filter(e => e.status === "bought") ?? [];
  return <div className="page flow narrow">
    <FlowHead title={finished ? "Buy done" : "Buying"} back="/" />
    <ErrorState error={b.error} onRetry={b.reload} />
    <div className="center celebrate">
      <div className="burst" aria-hidden="true">{finished && Array.from({ length: 10 }, (_, i) => <i key={i} style={{ "--a": `${i * 36}deg` } as React.CSSProperties} />)}<Coin3D size={132} /></div>
      <p className="kicker">{finished ? "In your wallet" : "Working on it"}</p>
      <h1 className="h-hero">{finished ? <>You bought<br />{bought.length} asset{bought.length === 1 ? "" : "s"}</> : <>{bought.length} of {d?.entries.length ?? "…"}<br />bought</>}</h1>
      {d?.totals && <p className="sub">Bought {fmtUsd6(d.totals.boughtUsd6)} · fees {fmtUsd6(d.totals.feesUsd6)} · left in jars {fmtUsd6(d.totals.leftInJarsUsd6)}</p>}
      {!finished && <p className="sub">You can leave this screen. We'll notify you when it's done.</p>}
    </div>
    {d && <div className="card list" style={{ marginTop: 28 }}>
      {d.entries.map(e => { const name = assetName(e.assetId, e.name); return <button className="row" key={e.assetId} onClick={() => navigate(`/holdings/${encodeURIComponent(e.assetId)}`)}>
        <Monogram tone={toneFor(e.assetId)}>{e.status === "bought" ? <Check size={18} strokeWidth={2.6} /> : name.slice(0, 2).toUpperCase()}</Monogram>
        <span className="row-main"><span className="row-title">{name}</span><span className="row-sub">{e.fillPriceUsd6 ? `Bought at ${fmtUsd6(e.fillPriceUsd6)}` : e.status}</span></span>
        <span className="row-value">{fmtUsd6(e.spentUsd6 ?? e.amountUsd6)}</span>
      </button>; })}
    </div>}
    {!d && !b.error && <Skeleton h={180} mt={28} />}
    <div className="dock">
      <button className="button primary full lg" onClick={() => navigate("/holdings")}>See what you own <ArrowRight size={18} /></button>
      {bought[0] && <button className="button quiet full" onClick={() => navigate(`/holdings/${encodeURIComponent(bought[0].assetId)}#share`)}><Share2 size={16} /> Share what I own</button>}
    </div>
  </div>;
}
