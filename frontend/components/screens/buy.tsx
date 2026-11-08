"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ExternalLink, Share2, ShieldCheck, Zap } from "lucide-react";
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

/** Dollars string like "0.50" → Usd6 digit string (whole cents). */
function dollarsToUsd6(s: string): string | null {
  const t = s.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  const cents = BigInt(w) * 100n + BigInt((f + "00").slice(0, 2));
  return (cents * 10_000n).toString();
}

function usd6ToDollarsInput(usd6: string): string {
  const n = BigInt(usd6);
  const dollars = n / 1_000_000n;
  const cents = (n % 1_000_000n) / 10_000n;
  return cents === 0n ? dollars.toString() : `${dollars}.${cents.toString().padStart(2, "0")}`;
}

export function BuyReview({ all = false }: { all?: boolean }) {
  const { navigate } = useApp();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"idle" | "signing" | "submitting">("idle");
  const amountsKey = JSON.stringify(amounts);
  const r = useApi(`review:${all}:${amountsKey}`, () => api.buysReview(all, Object.keys(amounts).length ? amounts : undefined));
  const [left, setLeft] = useState(30);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!r.data) return;
    const end = new Date(r.data.expiresAt).getTime();
    const t = setInterval(() => { const s = Math.max(0, Math.round((end - Date.now()) / 1000)); setLeft(s); if (s === 0) r.reload(); }, 1000);
    return () => clearInterval(t);
  }, [r.data, r]);
  useEffect(() => {
    const data = r.data;
    if (!data) return;
    setInputs(prev => {
      const next = { ...prev };
      for (const row of data.rows) {
        if (next[row.assetId] == null) next[row.assetId] = usd6ToDollarsInput(row.amountUsd6);
      }
      return next;
    });
  }, [r.data]);
  const d = r.data;
  const rows = d?.rows ?? [];
  const selectable = rows.filter(x => x.selectable);
  const applyAmount = (assetId: string, jarCap: string) => {
    const raw = inputs[assetId] ?? "";
    const usd6 = dollarsToUsd6(raw);
    if (!usd6) { setErr("Enter a dollar amount like 0.50"); return; }
    const capped = BigInt(usd6) > BigInt(jarCap) ? jarCap : usd6;
    setAmounts(a => ({ ...a, [assetId]: capped }));
    setErr(null);
  };
  const buy = async () => {
    if (!d) return;
    setPhase("signing"); setErr(null);
    try {
      const signed = await signAction({ kind: "typed_data", typedData: d.approval.typedData, summary: `Buy ${selectable.length} assets` });
      setPhase("submitting");
      const { batchIds } = await api.buy(d.quoteId, d.approval.typedData, signed.signature ?? "mock");
      refreshAll(); navigate(`/buy/${batchIds[0]}`);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : (e as { code?: string }).code;
      setErr(errorCopy(code ?? "BAD_SIGNATURE")); setPhase("idle");
      if (code === "QUOTE_EXPIRED") r.reload();
    }
  };
  const phaseLabel = phase === "signing" ? "Approve in wallet…" : phase === "submitting" ? "Submitting…" : null;
  return <div className="page flow wide">
    <FlowHead title={rows.length ? `Buy ${selectable.length || rows.length} jar${rows.length > 1 ? "s" : ""}` : "Buy"} back="/jars" />
    <ErrorState error={r.error} onRetry={r.reload} />
    {d && <div className="live"><Ring value={(left / 30) * 100} size={30} stroke={3} /><span>Prices update live · next in <b className="num">{left} s</b></span></div>}
    {r.loading && <SkeletonList rows={3} />}
    {d && <div className="two-col">
      <div className="quotes">
        {rows.map(q => { const name = assetName(q.assetId, q.name); const jarCap = q.jarAmountUsd6 ?? q.amountUsd6; return <article className={`card quote ${q.selectable ? "" : "off"}`} key={q.assetId}>
          <header className="quote-top">
            <Monogram name={name} tone={toneFor(q.assetId)} />
            <div className="row-main"><div className="row-title">{name} {q.token && <span className="sub">{q.token}</span>}</div><div className="row-sub">{q.selectable ? `Best price on ${q.chain === "solana" ? "Solana" : q.chain}` : q.reason === "fees_high" ? `Fees too high (${(q.fees.pctBps / 100).toFixed(1)}%)` : "Buys when available"}</div></div>
            <strong className="num">{fmtUsd6(q.amountUsd6)}</strong>
          </header>
          {q.mint && <p className="fineprint mono">mint {q.mint.slice(0, 4)}…{q.mint.slice(-4)} · {q.decimals} decimals</p>}
          {q.arkiv && <a className="fineprint" href={q.arkiv.url} target="_blank" rel="noreferrer"><ShieldCheck size={14} /> Token verified on Arkiv</a>}
          {BigInt(q.price.usd6PerUnit || "0") > 0n && <dl className="quote-grid">
            <div><dt>Price now</dt><dd>{fmtUsd6(q.price.usd6PerUnit)}{q.token ? ` per ${q.token}` : ""}</dd></div>
            <div><dt>You get about</dt><dd>{q.estQty} {q.token}</dd></div>
            <div><dt>Won't buy above</dt><dd>{fmtUsd6(q.maxPriceUsd6)} (+1%)</dd></div>
            <div><dt>Fees</dt><dd>{fmtUsd6(q.fees.totalUsd6)} ({(q.fees.pctBps / 100).toFixed(1)}%)</dd></div>
          </dl>}
          <div className="quote-amount field">
            <label htmlFor={`amt-${q.assetId}`}>Buy amount <em>(jar has {fmtUsd6(jarCap)})</em></label>
            <div className="btn-row">
              <input id={`amt-${q.assetId}`} inputMode="decimal" value={inputs[q.assetId] ?? ""} onChange={e => setInputs(i => ({ ...i, [q.assetId]: e.target.value }))} aria-label={`Amount for ${name}`} />
              <button type="button" className="button secondary sm" onClick={() => applyAmount(q.assetId, jarCap)}>Update</button>
            </div>
          </div>
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
          {phaseLabel ? <button className="button primary full lg" disabled>{phaseLabel}</button>
            : selectable.length ? <ConfirmAction label={`Buy now · ${fmtUsd6(d.totalUsd6)}`} onConfirm={buy} />
            : <button className="button primary full lg" disabled>Nothing can be bought right now</button>}
          <p className="fineprint center"><ShieldCheck size={14} /> Nothing buys without this approval.</p>
        </div>
      </div>
    </div>}
  </div>;
}

export function SellReview({ assetId }: { assetId: string }) {
  const { navigate } = useApp();
  const [qty, setQty] = useState("");
  const [qtyApplied, setQtyApplied] = useState<string | undefined>();
  const r = useApi(`sell:${assetId}:${qtyApplied ?? "all"}`, () => api.sellsReview(assetId, qtyApplied));
  const [phase, setPhase] = useState<"idle" | "signing" | "submitting">("idle");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (r.data && !qty) setQty(r.data.qty); }, [r.data, qty]);
  const sell = async () => {
    if (!r.data) return;
    setPhase("signing"); setErr(null);
    try {
      const signed = await signAction(r.data.action);
      setPhase("submitting");
      const txHash = signed.txHash ?? (r.data.action.kind === "typed_data" ? "mock" : undefined);
      if (!txHash) throw Object.assign(new Error("BAD_SIGNATURE"), { code: "BAD_SIGNATURE" });
      const { sellId } = await api.sell(r.data.quoteId, txHash);
      refreshAll(); navigate(`/sell/${sellId}`);
    } catch (e) {
      setErr(errorCopy(e instanceof ApiError ? e.code : (e as { code?: string }).code)); setPhase("idle");
    }
  };
  const d = r.data;
  return <div className="page flow narrow">
    <FlowHead title="Sell" back={`/holdings/${encodeURIComponent(assetId)}`} />
    <ErrorState error={r.error} onRetry={r.reload} />
    {r.loading && <SkeletonList rows={3} />}
    {d && <>
      <section className="card summary">
        <div className="summary-line"><span>{d.name}{d.token ? ` · ${d.token}` : ""}</span><strong>{d.qty}</strong></div>
        <div className="summary-line"><span>You get about</span><strong>{fmtUsd6(d.estUsdcUsd6)} USDC</strong></div>
        <div className="summary-line"><span>Fees</span><strong>{fmtUsd6(d.fees.totalUsd6)}</strong></div>
        {d.mint && <p className="fineprint mono">mint {d.mint.slice(0, 4)}…{d.mint.slice(-4)} · {d.decimals} decimals</p>}
      </section>
      <label className="field" htmlFor="sell-qty">Quantity to sell
        <div className="btn-row">
          <input id="sell-qty" value={qty} onChange={e => setQty(e.target.value)} />
          <button type="button" className="button secondary sm" onClick={() => { setQtyApplied(qty); setErr(null); }}>Update</button>
        </div>
      </label>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="dock">
        {phase !== "idle" ? <button className="button primary full lg" disabled>{phase === "signing" ? "Approve in wallet…" : "Submitting…"}</button>
          : <ConfirmAction label={`Sell · ${fmtUsd6(d.estUsdcUsd6)}`} onConfirm={sell} />}
      </div>
    </>}
  </div>;
}

export function SellDone({ sellId }: { sellId: string }) {
  const { navigate } = useApp();
  const s = useApi(`sellDone:${sellId}`, () => api.sellProgress(sellId), { pollMs: 2000 });
  const d = s.data;
  const done = d?.status === "done" || d?.status === "failed";
  useEffect(() => { if (done) refreshAll(); }, [done]);
  return <div className="page flow narrow">
    <FlowHead title={done ? "Sold" : "Selling"} back="/holdings" />
    <ErrorState error={s.error} onRetry={s.reload} />
    <div className="center celebrate">
      <Coin3D size={132} />
      <p className="kicker">{done ? "USDC in your wallet" : "Working on it"}</p>
      <h1 className="h-hero">{d?.receivedUsd6 ? <>Sold for<br />{fmtUsd6(d.receivedUsd6)}</> : "Selling…"}</h1>
      {d?.explorerUrl && <a className="button secondary" href={d.explorerUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> View on Solscan</a>}
    </div>
    <div className="dock">
      <button className="button primary full lg" onClick={() => navigate("/holdings")}>Back to holdings</button>
    </div>
  </div>;
}

export function BuyDone({ batchId }: { batchId: string }) {
  const { navigate } = useApp();
  const b = useApi(`buy:${batchId}`, () => api.buyProgress(batchId), { pollMs: 2000 });
  useEffect(() => { haptic([12, 60, 12, 60, 24]); }, []);
  const d = b.data;
  const finished = d && (/^done/.test(d.status) || d.status === "failed");
  const swapping = d && !finished && (d.status === "swapping" || d.status === "approved" || d.status === "executing");
  useEffect(() => { if (finished) refreshAll(); }, [finished]);
  const bought = d?.entries.filter(e => e.status === "bought") ?? [];
  return <div className="page flow narrow">
    <FlowHead title={finished ? (d?.status === "failed" ? "Buy failed" : "Buy done") : "Buying"} back="/" />
    <ErrorState error={b.error} onRetry={b.reload} />
    <div className="center celebrate">
      <div className="burst" aria-hidden="true">{finished && Array.from({ length: 10 }, (_, i) => <i key={i} style={{ "--a": `${i * 36}deg` } as React.CSSProperties} />)}<Coin3D size={132} /></div>
      <p className="kicker">{finished ? (d?.status === "failed" ? "Nothing bought" : "In your wallet") : swapping ? "Swapping on Solana" : "Working on it"}</p>
      <h1 className="h-hero">{finished ? <>You bought<br />{bought.length} asset{bought.length === 1 ? "" : "s"}</> : <>{bought.length} of {d?.entries.length ?? "…"}<br />bought</>}</h1>
      {d?.totals && <p className="sub">Bought {fmtUsd6(d.totals.boughtUsd6)} · fees {fmtUsd6(d.totals.feesUsd6)} · left in jars {fmtUsd6(d.totals.leftInJarsUsd6)}</p>}
      {!finished && <p className="sub">You can leave this screen. We'll notify you when it's done.</p>}
    </div>
    {d && <div className="card list" style={{ marginTop: 28 }}>
      {d.entries.map(e => { const name = assetName(e.assetId, e.name); return <div className="row" key={e.assetId}>
        <Monogram tone={toneFor(e.assetId)}>{e.status === "bought" ? <Check size={18} strokeWidth={2.6} /> : name.slice(0, 2).toUpperCase()}</Monogram>
        <button className="row-main" style={{ background: "none", border: 0, textAlign: "left", padding: 0, cursor: "pointer" }} onClick={() => navigate(`/holdings/${encodeURIComponent(e.assetId)}`)}>
          <span className="row-title">{name}</span>
          <span className="row-sub">{e.fillPriceUsd6 ? `Bought at ${fmtUsd6(e.fillPriceUsd6)}` : e.status}{e.qty ? ` · ${e.qty}` : ""}</span>
        </button>
        <span className="row-end">
          <span className="row-value">{fmtUsd6(e.spentUsd6 ?? e.amountUsd6)}</span>
          {e.explorerUrl && <a className="fineprint" href={e.explorerUrl} target="_blank" rel="noreferrer" onClick={ev => ev.stopPropagation()}><ExternalLink size={14} /> Solscan</a>}
        </span>
      </div>; })}
    </div>}
    {!d && !b.error && <Skeleton h={180} mt={28} />}
    <div className="dock">
      <button className="button primary full lg" onClick={() => navigate("/holdings")}>See what you own <ArrowRight size={18} /></button>
      {bought[0] && <button className="button quiet full" onClick={() => navigate(`/holdings/${encodeURIComponent(bought[0].assetId)}#share`)}><Share2 size={16} /> Share what I own</button>}
    </div>
  </div>;
}
