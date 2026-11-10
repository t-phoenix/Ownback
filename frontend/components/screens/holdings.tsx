"use client";

import { useState } from "react";
import { Check, ChevronRight, Copy, ExternalLink, Eye, EyeOff, Loader2, Share2 } from "lucide-react";
import { useApp } from "../app-context";
import { Logo } from "../logo";
import { Creative, Money, Monogram, PriceTag, Sheet, Tilt } from "../ui";
import { Empty, ErrorState, Skeleton, SkeletonList } from "../states";
import { api, ApiError, type HoldingRow as Row, type MoveProgress } from "../../lib/api";
import { signAction } from "../../lib/sign-action";
import { errorCopy } from "../../lib/copy";
import { dollarsToUsd6, usd6ToDollarsInput } from "./buy";
import { useApi, refreshAll } from "../../lib/use-api";
import { assetName, toneFor } from "../../lib/assets";
import { centsOf, fmtUsd6, pct } from "../../lib/money";
import { FlowHead } from "./home";

const sectionTitle: Record<string, string> = { stocksCommodities: "What you own", stablecoins: "Your dollars", makers: "Makers", behind: "Behind the product", commodities: "Materials", index: "Index", crypto: "Crypto" };

export function HoldingRow({ h, onSolUsdc }: { h: Row; onSolUsdc?: (h: Row) => void }) {
  const { navigate } = useApp();
  const isUsd = h.assetId === "usdc" || h.assetId === "usdc-sol";
  const name = isUsd ? h.name : assetName(h.assetId, h.name);
  const open = () => h.assetId === "usdc-sol" ? onSolUsdc?.(h) : navigate(isUsd ? "/funds" : `/holdings/${encodeURIComponent(h.assetId)}`);
  return <button className="row" onClick={open}>
    <Monogram name={isUsd ? undefined : name} icon={h.icon} tone={isUsd ? "green" : toneFor(h.assetId)}>{isUsd ? "$" : undefined}</Monogram>
    <span className="row-main"><span className="row-title">{name}</span><span className="row-sub">{h.qty && h.token ? `${h.qty} ${h.token}` : h.subtitle}</span></span>
    <span className="row-end"><span className="row-value">{fmtUsd6(h.valueUsd6)}</span><PriceTag token={h.token} usd6={h.price?.usd6PerUnit} /></span>
    <ChevronRight size={16} className="row-chev" />
  </button>;
}

export function Holdings() {
  const { navigate } = useApp();
  const h = useApi("holdings", api.holdings);
  const b = h.data?.balance;
  const owned = centsOf(b?.byType.stocksCommodities), total = centsOf(b?.totalUsd6);
  const sections = h.data?.sections ?? [];
  const [move, setMove] = useState<Row | null>(null);
  return <div className="page">
    <header className="page-head">
      <div><p className="kicker">Your portfolio</p><h1 className="h-page">Holdings</h1></div>
      <button className="link" onClick={() => navigate("/settings")}>Wallet <ChevronRight size={15} /></button>
    </header>
    <ErrorState error={h.error} onRetry={h.reload} />

    {h.loading ? <Skeleton h={150} /> : <section className="card alloc" aria-label="Balance">
      <div className="alloc-top">
        <div><p className="micro">You own</p><Money cents={owned} className="alloc-num" /><p className="sub">Companies and materials</p></div>
        <div className="alloc-right"><p className="micro">Dollars</p><Money cents={centsOf(b?.byType.stablecoins)} className="alloc-num muted-num" /><p className="sub">Free + in jars</p></div>
      </div>
      <div className="alloc-bar" role="img" aria-label={`${pct(owned, total || 1n)}% owned`}>
        <span className="tone-bg-gold" style={{ flexGrow: Number(owned) || 0 }} />
        <span className="tone-bg-green" style={{ flexGrow: Number(total - owned) || 1 }} />
      </div>
      {b?.stale && <p className="sub">Prices may be out of date.</p>}
    </section>}

    {h.data && !sections.some(s => s.rows.length) && <Empty title="Nothing owned yet" body="When a jar fills and you approve the buy, the shares land in your own wallet and show up here." />}

    <div className="two-col">
      {sections.filter(s => s.rows.length).map(s => <section key={s.key} className="block">
        <div className="block-head"><h2 className="h-section">{sectionTitle[s.key] ?? s.key}</h2><span className="sub">{fmtUsd6(s.totalUsd6)}</span></div>
        <div className="card list">{s.rows.map(r => <HoldingRow key={r.assetId} h={r} onSolUsdc={setMove} />)}</div>
      </section>)}
    </div>
    <MoveToArc row={move} onClose={() => { setMove(null); h.reload(); }} />
  </div>;
}

export function Holding({ id }: { id: string }) {
  const { navigate, notify } = useApp();
  const d = useApi(`holding:${id}`, () => api.holding(id));
  const [hide, setHide] = useState(true);
  const name = assetName(id, d.data?.name);
  const proof = d.data?.proof;
  const steps = [
    { label: `Receipt matched to ${name}`, sub: proof?.ogRequestId ? `0G request ${proof.ogRequestId.slice(0, 8)}…` : undefined, done: !!proof?.ogRequestId },
    { label: "USDC moved from Arc to Solana", sub: proof?.arcTx ? `Arc ${proof.arcTx.slice(0, 10)}…` : undefined, href: proof?.links.arc, done: !!proof?.arcTx },
    { label: `${name} bought on Jupiter`, sub: proof?.venueTx ? `Solana ${proof.venueTx.slice(0, 10)}…` : undefined, href: proof?.links.venue, done: !!proof?.venueTx },
    { label: "Ownership record published", sub: proof?.arkivKey ? "Arkiv" : "Pending", done: !!proof?.arkivKey },
  ];
  const shareText = `I bought something I love. Now I own a piece of ${name}.`;
  const canSell = !!d.data?.qty && BigInt(d.data.valueUsd6 || "0") > 0n;
  return <div className="page flow wide">
    <FlowHead title={name} kicker={d.data?.token} back="/holdings" />
    <ErrorState error={d.error} onRetry={d.reload} />
    <div className="two-col">
      <div>
        {d.loading ? <Skeleton h={100} /> : <section className="card holding-hero">
          <Monogram name={name} icon={d.data?.icon} tone={toneFor(id)} size={60} />
          <div><p className="micro">{name}{d.data?.token ? ` · ${d.data.token}` : ""}</p><Money cents={centsOf(d.data?.valueUsd6)} className="holding-num" /><p className="sub">{d.data?.qty ? `${d.data.qty} ${d.data.token ?? ""} in your wallet` : "Nothing bought yet"}</p>
            <div className="hero-tags"><PriceTag token={d.data?.token} usd6={d.data?.price?.usd6PerUnit} />{d.data && BigInt(d.data.avgPriceUsd6 || "0") > 0n && <span className="sub">You paid {fmtUsd6(d.data.avgPriceUsd6)} avg</span>}</div></div>
        </section>}
        {canSell && <div className="dock" style={{ position: "relative", marginBottom: 16 }}>
          <button className="button secondary full" onClick={() => navigate(`/sell/review/${encodeURIComponent(id)}`)}>Sell for USDC</button>
        </div>}
        {d.data?.token && <button className="button quiet full" style={{ marginBottom: 16 }} onClick={() => navigate(`/buy/review?asset=${encodeURIComponent(id)}`)}>Buy more {d.data.token}</button>}

        {d.data && BigInt(d.data.spentThisYearUsd6 || "0") > 0n && <section className="card versus" aria-label="Spent versus owned">
          <p className="versus-copy">You spent <b>{fmtUsd6(d.data.spentThisYearUsd6)}</b> on {name} this year. You now own <b className="pos">{fmtUsd6(d.data.valueUsd6)}</b> of {name}.</p>
          <div className="versus-bars">
            <div><span className="sub">Spent</span><span className="vbar"><i style={{ width: "100%" }} /></span><b>{fmtUsd6(d.data.spentThisYearUsd6)}</b></div>
            <div><span className="sub">Own</span><span className="vbar own"><i style={{ width: `${Math.max(2, pct(BigInt(d.data.valueUsd6), BigInt(d.data.spentThisYearUsd6)))}%` }} /></span><b>{fmtUsd6(d.data.valueUsd6)}</b></div>
          </div>
        </section>}

        <section className="block" aria-labelledby="proof">
          <h2 id="proof" className="h-section">Proof trail for the last buy</h2>
          {d.loading ? <SkeletonList rows={4} /> : <ol className="timeline card">
            {steps.map(s => <li key={s.label} className={s.done ? "" : "pending"}>
              <span className="tl-dot">{s.done ? <Check size={13} strokeWidth={2.6} /> : null}</span>
              <span className="row-main"><span className="row-title">{s.label}</span>{s.sub && <span className="row-sub mono">{s.sub}</span>}</span>
              {"href" in s && s.href && <a className="fineprint" href={s.href} target="_blank" rel="noreferrer"><ExternalLink size={14} /> View</a>}
            </li>)}
          </ol>}
        </section>
      </div>

      <div>
        <section className="block" aria-labelledby="share" id="share">
          <div className="block-head"><h2 id="share" className="h-section">Share it</h2>
            <button className="link" onClick={() => setHide(!hide)} aria-pressed={hide}>{hide ? <EyeOff size={15} /> : <Eye size={15} />} {hide ? "Amounts hidden" : "Amounts shown"}</button>
          </div>
          <div className="share-card">
            <Tilt className="share-art" strength={6}><Creative name="coin" /></Tilt>
            <p className="micro gold">Own what you buy.</p>
            <h3 className="share-line">Now I own a piece of {name}.</h3>
            {!hide && d.data && <p className="share-amt">{fmtUsd6(d.data.valueUsd6)} of {name}</p>}
            <span className="share-logo"><Logo /></span>
          </div>
          <div className="btn-row">
            <button className="button secondary" onClick={() => { navigator.clipboard?.writeText(shareText).then(() => notify("Share text copied"), () => {}); }}><Copy size={16} /> Copy text</button>
            <button className="button quiet" onClick={() => { if (navigator.share) navigator.share({ text: shareText }).catch(() => {}); else notify("Share text copied"); }}><Share2 size={16} /> More</button>
          </div>
        </section>
        {d.data?.issuerNote && <p className="fineprint">{d.data.issuerNote}</p>}
      </div>
    </div>
  </div>;
}

/** Solana USDC → CCTP → your Arc wallet. You sign on Solana; Ownback pays SOL and the Arc mint gas. */
function MoveToArc({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const [amt, setAmt] = useState("");
  const [phase, setPhase] = useState<"idle" | "building" | "signing" | "sending">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const m = useApi<MoveProgress | null>(moveId ? `move:${moveId}` : null, () => api.moveProgress(moveId!), { pollMs: 3000 });
  const max = row?.valueUsd6 ?? "0";
  const go = async () => {
    const usd6 = dollarsToUsd6(amt || usd6ToDollarsInput(max));
    if (!usd6 || BigInt(usd6) > BigInt(max)) { setErr("Enter an amount up to your Solana USDC"); return; }
    setErr(null); setPhase("building");
    try {
      const { moveId: id, action } = await api.moveToArc(usd6);
      setPhase("signing");
      const signed = await signAction(action);
      setPhase("sending");
      await api.moveSubmit(id, signed.signedTx!);
      setMoveId(id); refreshAll();
    } catch (e) { setErr(errorCopy(e instanceof ApiError ? e.code : (e as { code?: string }).code)); }
    finally { setPhase("idle"); }
  };
  const st = m.data;
  const label = phase === "building" ? "Preparing…" : phase === "signing" ? "Approve in wallet…" : phase === "sending" ? "Burning on Solana…" : null;
  return <Sheet open={!!row} onClose={() => { setMoveId(null); setAmt(""); onClose(); }} title="Move USDC to Arc">
    {!moveId ? <>
      <p className="sub">You have {fmtUsd6(max)} USDC on Solana. It moves through Circle CCTP to your Arc wallet, usually in a minute.</p>
      <label className="field" htmlFor="move-amt">Amount (USD)
        <div className="btn-row"><input id="move-amt" inputMode="decimal" value={amt} placeholder={usd6ToDollarsInput(max)} onChange={e => setAmt(e.target.value)} disabled={!!label} />
          <button type="button" className="chip" onClick={() => setAmt(usd6ToDollarsInput(max))}>Max</button></div>
      </label>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="button primary full" disabled={!!label} onClick={go}>{label ? <><Loader2 size={16} className="spin" /> {label}</> : "Move to Arc"}</button>
    </> : <ol className="card list" aria-live="polite">
      <li className="row"><span className="mini-icon sm"><Check size={16} /></span><span className="row-main"><span className="row-title">Burned on Solana</span></span>{st?.links.sol && <a className="fineprint" href={st.links.sol} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Solscan</a>}</li>
      <li className="row"><span className="mini-icon sm">{st?.status === "sent" ? <Check size={16} /> : <Loader2 size={16} className="spin" />}</span><span className="row-main"><span className="row-title">{st?.status === "sent" ? "Arrived on Arc" : "Circle attests, then we mint on Arc"}</span>{st?.error && <span className="row-sub">Retrying: {st.error}</span>}</span>{st?.links.arc && <a className="fineprint" href={st.links.arc} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Arc</a>}</li>
    </ol>}
  </Sheet>;
}
