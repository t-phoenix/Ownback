"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Check, ChevronRight, ExternalLink, Loader2, RefreshCw, Share2, ShieldCheck, Zap } from "lucide-react";
import { useApp } from "../app-context";
import { Coin3D, ConfirmAction, GlassJar, Monogram, Ring, Sheet, haptic } from "../ui";
import { Empty, ErrorState, Skeleton, SkeletonList } from "../states";
import { api, ApiError, type BuyEntry, type BuyProgress, type Jar, type SignableAction } from "../../lib/api";
import { useApi, refreshAll } from "../../lib/use-api";
import { arcStepWhy, errorCopy, pipelineCopy } from "../../lib/copy";
import { isNoopAction, signAction, type StepUpdate } from "../../lib/sign-action";
import { assetName, toneFor } from "../../lib/assets";
import { fmtUsd6, pct } from "../../lib/money";
import { FlowHead } from "./home";

/** Safe BigInt for Usd6 fields — never throw in render (ScreenBoundary → "couldn't load this"). */
const bi = (v: string | number | bigint | null | undefined) => {
  try { return BigInt(v ?? 0); } catch { return 0n; }
};

export function Jars() {
  const { navigate } = useApp();
  const j = useApi("jars", api.jars);
  const [sheet, setSheet] = useState<Jar | null>(null);
  const press = useRef<ReturnType<typeof setTimeout>>(undefined);
  const jars = j.data?.jars ?? [];
  const ready = jars.filter(x => x.state === "ready"), other = jars.filter(x => x.state !== "ready");
  const readyTotal = ready.reduce((s, x) => s + bi(x.amountUsd6), 0n);
  const holdStart = (x: Jar) => { press.current = setTimeout(() => { haptic(14); setSheet(x); }, 450); };
  const holdEnd = () => clearTimeout(press.current);

  const reviewOne = (x: Jar) =>
    `/buy/review?asset=${encodeURIComponent(x.assetId)}&amount=${encodeURIComponent(x.amountUsd6)}`;

  const card = (x: Jar) => {
    const p = pct(bi(x.amountUsd6), bi(x.readyMinUsd6)); const isReady = x.state === "ready";
    const name = assetName(x.assetId, x.name);
    const left = bi(x.readyMinUsd6) - bi(x.amountUsd6);
    return <button key={x.assetId} className={`jar-card ${isReady ? "ready" : ""}`}
      onClick={() => (isReady ? navigate(reviewOne(x)) : setSheet(x))}
      onPointerDown={() => holdStart(x)} onPointerUp={holdEnd} onPointerLeave={holdEnd}
      onContextMenu={e => { e.preventDefault(); setSheet(x); }}
      aria-label={`${name} jar, ${fmtUsd6(x.amountUsd6)}. ${isReady ? "Ready, tap to buy" : "Filling"}. Long-press for options`}>
      <GlassJar pct={p} ready={isReady} size={74} />
      <span className="jar-name"><Monogram name={name} tone={toneFor(x.assetId)} size={22} /> {name}</span>
      <span className="jar-amt">{fmtUsd6(x.amountUsd6)}</span>
      <span className={`jar-state ${isReady ? "pos" : ""}`}>{isReady ? "Ready · tap to buy" : x.state === "no_venue" ? "Buys when available" : `Filling · ${fmtUsd6(left > 0n ? left : 0n)} to go`}</span>
    </button>;
  };

  return <div className="page">
    <header className="page-head"><div><p className="kicker">Set aside for each company</p><h1 className="h-page">Jars</h1></div>
      <button className="link" onClick={() => navigate("/settings")}>Capacity {fmtUsd6(jars[0]?.readyMinUsd6 ?? "5000000")} <ChevronRight size={15} /></button></header>
    <p className="lede left">Each purchase fills a jar per company. A jar at your capacity is ready to buy, and you can buy any jar sooner. Nothing buys without your OK.</p>
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
        <div className="sheet-jar"><GlassJar pct={pct(bi(sheet.amountUsd6), bi(sheet.readyMinUsd6))} ready={sheet.state === "ready"} size={64} /><div><strong className="num big">{fmtUsd6(sheet.amountUsd6)}</strong><p className="sub">{sheet.state === "ready" ? "Ready · tap to buy" : "Filling · fills from your next purchases"}</p></div></div>
        <button className="button primary full" onClick={() => { setSheet(null); navigate(reviewOne(sheet)); }}>{sheet.state === "ready" ? "Review and buy" : "Buy now anyway"}</button>
      </>}
    </Sheet>
  </div>;
}

/** Dollars string like "0.50" → Usd6 digit string (whole cents). */
export function dollarsToUsd6(s: string): string | null {
  const t = s.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  return ((BigInt(w) * 100n + BigInt((f + "00").slice(0, 2))) * 10_000n).toString();
}

export function usd6ToDollarsInput(usd6: string): string {
  const n = BigInt(usd6);
  const cents = (n % 1_000_000n) / 10_000n;
  return `${n / 1_000_000n}.${cents.toString().padStart(2, "0")}`;
}

const MIN_BUY_USD6 = 100_000n;
const codeOf = (e: unknown) => (e instanceof ApiError ? e.code : (e as { code?: string })?.code);
const detailsOf = (e: unknown) => (e instanceof ApiError ? (e.details as Record<string, string> | undefined) : undefined);

/** The Arc steps of a buy: what each one does before approval, then a live status per call with explorer links. */
function ArcPlan({ labels, steps }: { labels: string[]; steps: StepUpdate[] }) {
  return <ol className="card list arc-plan" aria-live="polite">
    {labels.map((label, i) => {
      const s = steps.find(x => x.index === i);
      return <li className="row" key={i}>
        <span className="mini-icon sm">{s?.state === "done" ? <Check size={16} /> : s ? <Loader2 size={16} className="spin" /> : <b className="num">{i + 1}</b>}</span>
        <span className="row-main"><span className="row-title">{label}</span>
          <span className="row-sub wrap">{!s ? arcStepWhy(label) : s.state === "signing" ? "Signing…" : s.state === "confirming" ? "Confirming on Arc…" : "Confirmed"}</span></span>
        {s?.txHash && <a className="fineprint" href={`https://explorer.arc.io/tx/${s.txHash}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Arc</a>}
      </li>;
    })}
  </ol>;
}

export function BuyReview({ all = false, assetId, amountUsd6 }: { all?: boolean; assetId?: string; amountUsd6?: string }) {
  const { navigate } = useApp();
  // A typed amount is a buy request; we only *suggest* the jar amount (your rules).
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"idle" | "starting" | "review" | "arc" | "submitting">("idle");
  // Arc steps waiting for one approval on our own sheet (no wallet popup per step).
  const [arcPlan, setArcPlan] = useState<{ batchId: string; action: Extract<SignableAction, { kind: "evm_calls" }> } | null>(null);
  const [steps, setSteps] = useState<StepUpdate[]>([]);
  const [err, setErr] = useState<string | null>(null);
  // Jar tap passes the jar balance; holdings "Buy more" falls back to $1.
  const seedAmt = amountUsd6 && bi(amountUsd6) >= MIN_BUY_USD6 ? amountUsd6 : "1000000";
  const seeded = assetId && !amounts[assetId] ? { [assetId]: seedAmt } : {};
  const req = { ...seeded, ...amounts };
  const r = useApi(`review:${all}:${JSON.stringify(req)}`, () => api.buysReview(all, Object.keys(req).length ? req : undefined));
  const [left, setLeft] = useState(30);
  useEffect(() => {
    if (!r.data || phase !== "idle") return;
    const end = new Date(r.data.expiresAt).getTime();
    const t = setInterval(() => { const sLeft = Math.max(0, Math.round((end - Date.now()) / 1000)); setLeft(sLeft); if (sLeft === 0) r.reload(); }, 1000);
    return () => clearInterval(t);
  }, [r.data, r, phase]);
  useEffect(() => {
    const data = r.data; if (!data) return;
    setInputs(prev => { const next = { ...prev }; for (const row of data.rows) if (next[row.assetId] == null) next[row.assetId] = usd6ToDollarsInput(row.amountUsd6); return next; });
  }, [r.data]);
  const d = r.data;
  const rows = d?.rows ?? [];
  const selectable = rows.filter(x => x.selectable);
  const dirty = rows.some(q => { const v = dollarsToUsd6(inputs[q.assetId] ?? ""); return v !== null && v !== q.amountUsd6; });
  const applyAmounts = () => {
    const next: Record<string, string> = {};
    for (const q of rows) {
      const v = dollarsToUsd6(inputs[q.assetId] ?? "");
      if (!v) { setErr("Enter a dollar amount like 0.50"); return; }
      if (BigInt(v) < MIN_BUY_USD6) { setErr("The smallest buy is $0.10"); return; }
      next[q.assetId] = v;
    }
    setErr(null); setAmounts(next);
  };
  const fail = (e: unknown) => {
    const code = codeOf(e);
    const details = detailsOf(e);
    setErr(code === "INSUFFICIENT_FREE" && details?.availableUsd6
      ? `You have ${fmtUsd6(details.availableUsd6)} available${details.where === "solana" ? " on Solana" : " on Arc"}. Add funds or buy a smaller amount.`
      : errorCopy(code ?? "CHALLENGE_FAILED"));
    setPhase("idle"); setArcPlan(null);
    // A half-done Arc run is rebuilt from chain state on the next start (vault `free` is reused), never re-sent as-is.
    if (code === "QUOTE_EXPIRED" || code === "TX_REVERTED" || code === "TX_NOT_FOUND") r.reload();
  };
  // Navigate first — refreshAll() remounts siblings and was racing the buy screen into the Next error page.
  const go = (batchId: string) => { navigate(`/buy/${batchId}`); refreshAll(); };
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
  const buy = async () => {
    if (!d) return;
    setErr(null); setSteps([]); setPhase("starting");
    try {
      const start = await api.buy(d.quoteId);
      if (start.action?.kind === "evm_calls" && !isNoopAction(start.action)) {
        setArcPlan({ batchId: start.batchId, action: start.action }); setPhase("review");
        return;
      }
      if (start.action) {
        setPhase("arc");
        const signed = await signAction(start.action);
        setPhase("submitting");
        await api.buyArcSubmitted(start.batchId, signed.txHash!);
      }
      go(start.batchId);
    } catch (e) { fail(e); }
  };
  const busy = phase !== "idle";
  const phaseLabel = phase === "starting" ? "Preparing…" : phase === "review" ? "Waiting for your approval…" : phase === "arc" ? "Signing on Arc…" : phase === "submitting" ? "Checking Arc receipt…" : null;
  const arcLabels = arcPlan ? arcPlan.action.calls.map((_, i) => arcPlan.action.labels?.[i] ?? `Step ${i + 1}`) : [];
  const arcDone = steps.filter(x => x.state === "done").length;
  return <div className="page flow wide">
    <FlowHead title={rows.length ? `Buy ${selectable.length || rows.length} asset${rows.length > 1 ? "s" : ""}` : "Buy"} back="/jars" />
    <ErrorState error={r.error} onRetry={r.reload} />
    {d && !busy && <div className="live"><Ring value={(left / 30) * 100} size={30} stroke={3} /><span>Live Jupiter quotes · refresh in <b className="num">{left} s</b></span></div>}
    {r.loading && !d && <SkeletonList rows={3} />}
    {d && <div className="two-col">
      <div className="quotes">
        {rows.map(q => { const name = assetName(q.assetId, q.name); return <article className={`card quote ${q.selectable ? "" : "off"}`} key={q.assetId}>
          <header className="quote-top">
            <Monogram name={name} tone={toneFor(q.assetId)} />
            <div className="row-main"><div className="row-title">{name} {q.token && <span className="sub">{q.token}</span>}</div><div className="row-sub">{q.selectable ? "Jupiter on Solana · into your wallet" : q.reason === "fees_high" ? `Fees too high (${(q.fees.pctBps / 100).toFixed(2)}%)` : "Not on-chain yet"}</div></div>
            <strong className="num">{fmtUsd6(q.amountUsd6)}</strong>
          </header>
          {q.mint && <p className="fineprint mono">{q.issuer ?? "Token"} · mint {q.mint.slice(0, 4)}…{q.mint.slice(-4)} · {q.decimals} decimals</p>}
          {q.arkiv && <a className="fineprint" href={q.arkiv.url} target="_blank" rel="noreferrer"><ShieldCheck size={14} /> Token verified on Arkiv</a>}
          {bi(q.price?.usd6PerUnit) > 0n && <dl className="quote-grid">
            <div><dt>Your price</dt><dd>{fmtUsd6(q.price.usd6PerUnit)}{q.token ? ` / ${q.token}` : ""}</dd></div>
            <div><dt>You get about</dt><dd>{q.estQty} {q.token}</dd></div>
            <div><dt>Market price</dt><dd>{fmtUsd6(q.refPriceUsd6)}</dd></div>
            <div><dt>Route cost</dt><dd>{fmtUsd6(q.fees.totalUsd6)} ({((q.fees?.pctBps ?? 0) / 100).toFixed(2)}%)</dd></div>
          </dl>}
          {(q.mint || q.selectable) && <div className="quote-amount field">
            <label htmlFor={`amt-${q.assetId}`}>Amount (USD)</label>
            <div className="btn-row">
              <input id={`amt-${q.assetId}`} inputMode="decimal" disabled={busy} value={inputs[q.assetId] ?? ""} onChange={e => setInputs(i => ({ ...i, [q.assetId]: e.target.value }))} aria-label={`Amount for ${name}`} />
              {bi(q.suggestedUsd6) > 0n && <button type="button" className="chip" disabled={busy} onClick={() => setInputs(i => ({ ...i, [q.assetId]: usd6ToDollarsInput(q.suggestedUsd6) }))}>Suggested {fmtUsd6(q.suggestedUsd6)}</button>}
            </div>
          </div>}
        </article>; })}
        {dirty && !busy && <button className="button secondary full" onClick={applyAmounts}>Update quotes</button>}
      </div>
      <div>
        <section className="card summary">
          <div className="summary-line"><span>Total</span><strong>{fmtUsd6(d.totalUsd6)}</strong></div>
          <div className="summary-line"><span>Route costs</span><strong>{fmtUsd6(d.fees.totalUsd6)} ({((d.fees?.pctBps ?? 0) / 100).toFixed(2)}%)</strong></div>
          {bi(d.funding?.solanaUsdc6) > 0n && <div className="summary-line"><span>From your Solana USDC</span><strong>{fmtUsd6((bi(d.totalUsd6) - bi(d.funding?.bridgeUsd6)).toString())}</strong></div>}
          {bi(d.funding?.bridgeUsd6) > 0n && <div className="summary-line"><span>Moved from Arc (CCTP)</span><strong>{fmtUsd6(d.funding.bridgeUsd6)}</strong></div>}
          <p className="sub">Arc balance {fmtUsd6(d.funding.arcUsdc6)} · Solana USDC {fmtUsd6(d.funding.solanaUsdc6)}. Price protection 1%.</p>
        </section>
        {d.destination && <p className="fineprint">Shares go straight to your Solana wallet <span className="mono">{d.destination.slice(0, 4)}…{d.destination.slice(-4)}</span>. Ownback pays the Solana gas.</p>}
        {err && <p className="error" role="alert">{err}</p>}
        <div className="dock">
          {phaseLabel ? <button className="button primary full lg" disabled><Loader2 size={16} className="spin" /> {phaseLabel}</button>
            : dirty ? <button className="button primary full lg" onClick={applyAmounts}>Update quotes first</button>
            : selectable.length ? <ConfirmAction label={`Buy now · ${fmtUsd6(d.totalUsd6)}`} onConfirm={buy} />
            : <button className="button primary full lg" disabled>Nothing can be bought right now</button>}
          <p className="fineprint center"><ShieldCheck size={14} /> You sign every step. Nothing moves without you.</p>
        </div>
      </div>
    </div>}
    <Sheet open={!!arcPlan} onClose={() => { if (phase === "review") { setArcPlan(null); setPhase("idle"); } }} title={`Approve ${arcLabels.length} step${arcLabels.length > 1 ? "s" : ""} on Arc`}>
      <p className="sub">Moves {fmtUsd6(d?.funding.bridgeUsd6)} of your Arc USDC to your own Solana wallet, where each share is bought. You approve once here; your wallet then signs each step in order.</p>
      <ArcPlan labels={arcLabels} steps={steps} />
      {phase === "review"
        ? <div className="dock">
            <button className="button primary full lg" onClick={() => { haptic(10); void runArc(); }}>Approve and start <ArrowRight size={18} /></button>
            <button className="button quiet full" onClick={() => { setArcPlan(null); setPhase("idle"); }}>Cancel</button>
          </div>
        : <div className="dock"><button className="button primary full lg" disabled><Loader2 size={16} className="spin" /> {phase === "submitting" ? "Checking Arc receipt…" : `Step ${Math.min(arcDone + 1, arcLabels.length)} of ${arcLabels.length}…`}</button></div>}
      <p className="fineprint center"><ShieldCheck size={14} /> Only these steps, only this amount. Checked on your device before signing.</p>
    </Sheet>
  </div>;
}

const STAGES: { key: string; label: string; doneAfter: BuyProgress["status"][] }[] = [
  { key: "arc", label: "USDC leaves your Arc vault", doneAfter: ["attesting", "minting", "swap_ready", "swapping", "done", "done_partial"] },
  { key: "attest", label: "Circle attests the transfer (CCTP)", doneAfter: ["minting", "swap_ready", "swapping", "done", "done_partial"] },
  { key: "mint", label: "USDC arrives in your Solana wallet", doneAfter: ["swap_ready", "swapping", "done", "done_partial"] },
];

function elapsed(from: string) { const s = Math.max(0, Math.round((Date.now() - new Date(from).getTime()) / 1000)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`; }

export function BuyDone({ batchId }: { batchId: string }) {
  const { navigate } = useApp();
  const [signing, setSigning] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [, tick] = useState(0);
  const b = useApi(`buy:${batchId}`, () => api.buyProgress(batchId), { pollMs: 2500 });
  const d = b.data;
  const finished = d && (d.status === "done" || d.status === "failed");
  useEffect(() => { if (finished) { refreshAll(); haptic([12, 60, 12, 60, 24]); } }, [finished]);
  useEffect(() => { if (finished) return; const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t); }, [finished]);

  const swapOne = useCallback(async (e: BuyEntry) => {
    setSigning(e.assetId); setErr(null);
    try {
      const { action } = await api.buySwap(batchId, e.assetId);
      const signed = await signAction(action);
      if (!signed.signedTx) throw Object.assign(new Error("CHALLENGE_FAILED"), { code: "CHALLENGE_FAILED" });
      await api.buySwapSubmit(batchId, e.assetId, signed.signedTx);
    } catch (x) {
      const details = detailsOf(x);
      const msg = codeOf(x) === "INSUFFICIENT_FREE" && details?.availableUsd6
        ? `You have ${fmtUsd6(details.availableUsd6)} on Solana. Add funds or buy a smaller amount.`
        : errorCopy(codeOf(x));
      setErr(`${assetName(e.assetId, e.name)}: ${msg}`);
    } finally { setSigning(null); b.reload(); }
  }, [batchId, b]);

  // Auto-sign only fresh quoted rows — paused ones wait for an explicit Retry so we don't loop failures.
  const auto = useRef(false);
  useEffect(() => {
    if (!d || auto.current || signing || retrying || (d.status !== "swap_ready" && d.status !== "swapping")) return;
    const pending = d.entries.filter(e => e.status === "quoted" && !e.error);
    if (!pending.length) return;
    auto.current = true;
    (async () => { for (const e of pending) await swapOne(e); })();
  }, [d, signing, retrying, swapOne]);

  const retryPipeline = async () => {
    setRetrying(true); setErr(null); auto.current = false;
    try {
      await api.buyRetry(batchId);
      await b.reload();
    } catch (x) {
      if (codeOf(x) === "VALIDATION" && detailsOf(x)?.reason === "needs_new_buy") {
        setErr("This buy never left Arc. Start a new buy from Review.");
      } else {
        setErr(errorCopy(codeOf(x)));
      }
    } finally { setRetrying(false); }
  };

  const bought = d?.entries.filter(e => e.status === "bought") ?? [];
  const open = d?.entries.filter(e => e.status !== "bought") ?? [];
  const canSwap = d && (d.status === "swap_ready" || d.status === "swapping" || d.status === "failed" || d.status === "done_partial");
  const stages = d && bi(d.bridgeUsd6) > 0n ? STAGES : [];
  const cctpStuck = d && (d.status === "attesting" || d.status === "minting" || (d.status === "bridging" && !!d.links.arc));
  const needsNewBuy = d?.status === "bridging" && !d.links.arc;
  const showRetry = !!(d && (d.error || cctpStuck || open.some(e => e.status === "paused" || e.status === "waiting") || d.status === "failed" || d.status === "done_partial"));
  const batchErr = pipelineCopy(d?.error);
  const kicker = !d ? "Loading…"
    : d.status === "done" ? "In your wallet"
    : d.status === "failed" ? "Paused — tap Retry to continue"
    : d.status === "bridging" ? "Waiting for your Arc approval"
    : d.status === "attesting" ? "Circle is attesting the transfer · usually under a minute"
    : d.status === "minting" ? "Delivering USDC on Solana"
    : "Sign each swap to finish";

  return <div className="page flow narrow">
    <FlowHead title={d?.status === "done" ? "Buy done" : "Buying"} back="/" />
    <ErrorState error={b.error} onRetry={b.reload} />
    <div className="center celebrate">
      <div className="burst" aria-hidden="true">{d?.status === "done" && Array.from({ length: 10 }, (_, i) => <i key={i} style={{ "--a": `${i * 36}deg` } as React.CSSProperties} />)}<Coin3D size={112} /></div>
      <p className="kicker">{kicker}</p>
      <h1 className="h-hero">{bought.length} of {d?.entries.length ?? "…"}<br />bought</h1>
      {d && <p className="sub">{fmtUsd6(d.boughtUsd6)} of {fmtUsd6(d.totalUsd6)} · {elapsed(d.startedAt)}</p>}
    </div>
    {batchErr && <p className="error" role="alert"><AlertTriangle size={14} /> {d?.status === "attesting" || d?.status === "minting" ? "Still working: " : ""}{batchErr}</p>}
    {err && <p className="error" role="alert">{err}</p>}
    {d && <ol className="card list" style={{ marginTop: 20 }} aria-live="polite">
      {stages.map(st => {
        const done = st.doneAfter.includes(d.status);
        const active = !done && ((st.key === "arc" && d.status === "bridging") || (st.key === "attest" && d.status === "attesting") || (st.key === "mint" && d.status === "minting"));
        const link = st.key === "arc" ? d.links.arc : st.key === "mint" ? d.links.mint : undefined;
        return <li className="row" key={st.key}>
          <span className="mini-icon sm">{done ? <Check size={16} /> : <Loader2 size={16} className="spin" />}</span>
          <span className="row-main">
            <span className="row-title">{st.label}</span>
            <span className="row-sub">{st.key === "arc" ? fmtUsd6(d.bridgeUsd6) : active && d.error ? pipelineCopy(d.error) : active ? "In progress" : done ? "Done" : "Waiting"}</span>
          </span>
          {link && <a className="fineprint" href={link} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {st.key === "arc" ? "Arc" : "Solscan"}</a>}
        </li>;
      })}
      {d.entries.map(e => {
        const name = assetName(e.assetId, e.name);
        const busy = signing === e.assetId || e.status === "sent";
        const entryErr = pipelineCopy(e.error);
        const sub = e.status === "bought" ? `${e.qty} ${e.token ?? ""} at ${fmtUsd6(e.fillPriceUsd6 ?? "0")}`
          : busy ? "Approve in wallet, then confirming on Solana…"
          : e.status === "paused" ? (entryErr || "Didn't go through")
          : canSwap ? "Ready to sign"
          : "Waits for USDC on Solana";
        return <li className="row" key={e.assetId}>
          <Monogram tone={toneFor(e.assetId)}>{e.status === "bought" ? <Check size={18} strokeWidth={2.6} /> : busy ? <Loader2 size={16} className="spin" /> : name.slice(0, 2).toUpperCase()}</Monogram>
          <span className="row-main">
            <span className="row-title">Buy {e.token ?? name}</span>
            <span className="row-sub">{sub}</span>
          </span>
          <span className="row-end">
            <span className="row-value">{fmtUsd6(e.spentUsd6 ?? e.amountUsd6)}</span>
            {e.explorerUrl && <a className="fineprint" href={e.explorerUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Solscan</a>}
            {canSwap && !busy && e.status !== "bought" && (
              <button className="button secondary sm" disabled={!!signing || retrying} onClick={() => swapOne(e)}>
                {e.status === "quoted" && !e.error ? "Sign and buy" : "Retry"}
              </button>
            )}
          </span>
        </li>;
      })}
    </ol>}
    {!d && !b.error && <Skeleton h={180} mt={28} />}
    {d && d.status !== "done" && <p className="fineprint center">You can leave this screen; the transfer keeps going. Come back from Activity to sign the swaps.</p>}
    <div className="dock">
      {needsNewBuy && <button className="button primary full lg" onClick={() => navigate("/buy/review")}>Start a new buy <ArrowRight size={18} /></button>}
      {showRetry && !needsNewBuy && (
        <button className="button primary full lg" disabled={retrying || !!signing} onClick={retryPipeline}>
          {retrying ? <><Loader2 size={16} className="spin" /> Retrying…</> : <><RefreshCw size={16} /> Retry</>}
        </button>
      )}
      <button className={`button ${showRetry || needsNewBuy ? "quiet" : "primary"} full lg`} onClick={() => navigate("/holdings")}>
        See what you own {!(showRetry || needsNewBuy) && <ArrowRight size={18} />}
      </button>
      {bought[0] && <button className="button quiet full" onClick={() => navigate(`/holdings/${encodeURIComponent(bought[0].assetId)}#share`)}><Share2 size={16} /> Share what I own</button>}
    </div>
  </div>;
}

export function SellReview({ assetId }: { assetId: string }) {
  const { navigate } = useApp();
  const [qty, setQty] = useState("");
  const [qtyApplied, setQtyApplied] = useState<string | undefined>();
  const r = useApi(`sell:${assetId}:${qtyApplied ?? "all"}`, () => api.sellsReview(assetId, qtyApplied));
  const [phase, setPhase] = useState<"idle" | "building" | "signing" | "submitting">("idle");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (r.data && !qty) setQty(r.data.qty); }, [r.data, qty]);
  const d = r.data;
  const dirty = !!d && qty.trim() !== "" && qty.trim() !== d.qty;
  const sell = async () => {
    if (!d) return;
    setErr(null); setPhase("building");
    try {
      const start = await api.sell(assetId, d.qty);
      if (start.action) {
        setPhase("signing");
        const signed = await signAction(start.action);
        setPhase("submitting");
        await api.sellSubmit(start.sellId, signed.signedTx!);
      }
      refreshAll(); navigate(`/sell/${start.sellId}`);
    } catch (e) { setErr(errorCopy(codeOf(e))); setPhase("idle"); r.reload(); }
  };
  const label = phase === "building" ? "Getting the best route…" : phase === "signing" ? "Approve in wallet…" : phase === "submitting" ? "Confirming on Solana…" : null;
  return <div className="page flow narrow">
    <FlowHead title="Sell" back={`/holdings/${encodeURIComponent(assetId)}`} />
    <ErrorState error={r.error} onRetry={r.reload} />
    {r.loading && !d && <SkeletonList rows={3} />}
    {d && <>
      <section className="card summary">
        <div className="summary-line"><span>You hold</span><strong>{d.heldQty} {d.token}</strong></div>
        <div className="summary-line"><span>Selling</span><strong>{d.qty} {d.token}</strong></div>
        <div className="summary-line"><span>You get about</span><strong>{fmtUsd6(d.estUsdcUsd6)} USDC</strong></div>
        <div className="summary-line"><span>Route cost</span><strong>{fmtUsd6(d.fees.totalUsd6)} ({(d.fees.pctBps / 100).toFixed(2)}%)</strong></div>
        <p className="fineprint mono">mint {d.mint.slice(0, 4)}…{d.mint.slice(-4)} · {d.decimals} decimals · market {fmtUsd6(d.priceUsd6)}</p>
      </section>
      <label className="field" htmlFor="sell-qty">Quantity to sell
        <div className="btn-row">
          <input id="sell-qty" inputMode="decimal" value={qty} disabled={phase !== "idle"} onChange={e => setQty(e.target.value)} />
          <button type="button" className="chip" disabled={phase !== "idle"} onClick={() => { setQty(d.heldQty); setQtyApplied(d.heldQty); }}>Max</button>
        </div>
      </label>
      <p className="fineprint">USDC lands in your Solana wallet. You can move it to Arc from Holdings.</p>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="dock">
        {label ? <button className="button primary full lg" disabled><Loader2 size={16} className="spin" /> {label}</button>
          : dirty ? <button className="button primary full lg" onClick={() => { setQtyApplied(qty.trim()); setErr(null); }}>Update quote</button>
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
    <FlowHead title={d?.status === "failed" ? "Sell failed" : done ? "Sold" : "Selling"} back="/holdings" />
    <ErrorState error={s.error} onRetry={s.reload} />
    <div className="center celebrate">
      <Coin3D size={132} />
      <p className="kicker">{d?.status === "failed" ? "Nothing was sold" : done ? "USDC in your Solana wallet" : "Confirming on Solana"}</p>
      <h1 className="h-hero">{d?.receivedUsd6 ? <>Sold for<br />{fmtUsd6(d.receivedUsd6)}</> : d?.status === "failed" ? "Try again" : "Selling…"}</h1>
      {d?.error && <p className="error">{d.error}</p>}
      {d?.explorerUrl && <a className="button secondary" href={d.explorerUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> View on Solscan</a>}
    </div>
    <div className="dock">
      <button className="button primary full lg" onClick={() => navigate("/holdings")}>Back to holdings</button>
    </div>
  </div>;
}
