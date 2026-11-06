"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Share2, ShieldCheck, Zap } from "lucide-react";
import { useApp } from "../app-context";
import { Coin3D, ConfirmAction, GlassJar, Monogram, Ring, Sheet, haptic, useCountdown } from "../ui";
import { holdings, jars, READY_MIN } from "../../lib/fixtures";
import { fmtUsd, pct } from "../../lib/money";
import { FlowHead } from "./home";

type J = typeof jars[number];

export function Jars() {
  const { navigate, notify } = useApp();
  const [sheet, setSheet] = useState<J | null>(null);
  const press = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ready = jars.filter(j => j.amountC >= READY_MIN);
  const filling = jars.filter(j => j.amountC < READY_MIN);
  const holdStart = (j: J) => { press.current = setTimeout(() => { haptic(14); setSheet(j); }, 450); };
  const holdEnd = () => clearTimeout(press.current);

  const jarCard = (j: J) => {
    const p = pct(j.amountC, READY_MIN); const isReady = p >= 100;
    return <button key={j.id} className={`jar-card ${isReady ? "ready" : ""}`}
      onClick={() => isReady ? navigate("/buy/review") : setSheet(j)}
      onPointerDown={() => holdStart(j)} onPointerUp={holdEnd} onPointerLeave={holdEnd}
      onContextMenu={e => { e.preventDefault(); setSheet(j); }}
      aria-label={`${j.name} jar, ${j.amount}. ${isReady ? "Ready, tap to buy" : "Filling"}. Long-press for options`}>
      <GlassJar pct={p} ready={isReady} size={74} />
      <span className="jar-name"><Monogram name={j.name} tone={j.tone} size={22} /> {j.name}</span>
      <span className="jar-amt">{j.amount}</span>
      <span className={`jar-state ${isReady ? "pos" : ""}`}>{isReady ? "Ready · tap to buy" : `Filling · ${fmtUsd(READY_MIN - j.amountC)} to go`}</span>
    </button>;
  };

  return <div className="page flow wide">
    <FlowHead title="Your jars" back="/" />
    <p className="lede left">Dollars wait in your vault on Arc. When a jar reaches $5 we'll remind you on Sunday. Nothing buys without your OK.</p>

    <section className="block">
      <div className="block-head"><h2 className="h-section"><Zap size={16} /> {ready.length} ready to buy</h2><strong className="num">$44.63</strong></div>
      <div className="jar-grid">{ready.map(jarCard)}</div>
    </section>
    <section className="block">
      <div className="block-head"><h2 className="h-section">Filling</h2><span className="sub">Long-press a jar for options</span></div>
      <div className="jar-grid">{filling.map(jarCard)}</div>
    </section>

    <div className="dock sticky">
      <button className="button primary full lg" onClick={() => navigate("/buy/review")}>Review and buy {ready.length} jars <ArrowRight size={18} /></button>
    </div>

    <Sheet open={!!sheet} onClose={() => setSheet(null)} title={sheet ? `${sheet.name} jar` : ""}>
      {sheet && <>
        <div className="sheet-jar"><GlassJar pct={pct(sheet.amountC, READY_MIN)} ready={sheet.amountC >= READY_MIN} size={64} /><div><strong className="num big">{sheet.amount}</strong><p className="sub">{sheet.amountC >= READY_MIN ? `Ready · tap to buy · price now ${sheet.price} per ${sheet.token}` : "Filling · fills from your next purchases"}</p></div></div>
        {sheet.amountC < READY_MIN && <button className="button primary full" onClick={() => { setSheet(null); navigate("/buy/review"); }}>Buy now anyway · fees {sheet.fees} ({sheet.feesPct})</button>}
        {sheet.amountC >= READY_MIN && <button className="button primary full" onClick={() => { setSheet(null); navigate("/buy/review"); }}>Review and buy</button>}
        <button className="button quiet full" onClick={() => { setSheet(null); notify("Approve in your wallet to cancel this jar"); }}>Cancel this jar</button>
      </>}
    </Sheet>
  </div>;
}

const quotes = [
  { name: "Apple", token: "AAPLx", amount: "$33.43", qty: "0.1128", price: "$296.31", max: "$299.27", fee: "$0.18 (0.5%)", tone: "green" as const },
  { name: "TSMC", token: "TSMx", amount: "$6.10", qty: "0.0215", price: "$283.72", max: "$286.56", fee: "$0.07 (1.1%)", tone: "mint" as const },
  { name: "Gold", token: "PAXG", amount: "$5.10", qty: "0.0017", price: "$2,947", max: "$2,976", fee: "$0.06 (1.2%)", tone: "gold" as const },
];

export function BuyReview() {
  const { navigate } = useApp();
  const s = useCountdown(30);
  return <div className="page flow wide">
    <FlowHead title="Buy 3 ready jars" back="/jars" />
    <div className="live"><Ring value={(s / 30) * 100} size={30} stroke={3} /><span>Prices update live · next in <b className="num">{s} s</b></span></div>
    <div className="two-col">
      <div className="quotes">
        {quotes.map(q => <article className="card quote" key={q.name}>
          <header className="quote-top">
            <Monogram name={q.name} tone={q.tone} />
            <div className="row-main"><div className="row-title">{q.name} <span className="sub">{q.token}</span></div><div className="row-sub">Best price on Solana</div></div>
            <strong className="num">{q.amount}</strong>
          </header>
          <dl className="quote-grid">
            <div><dt>Price now</dt><dd>{q.price} per {q.token}</dd></div>
            <div><dt>You get about</dt><dd>{q.qty} {q.token}</dd></div>
            <div><dt>Won't buy above</dt><dd>{q.max} (+1%)</dd></div>
            <div><dt>Fees</dt><dd>{q.fee}</dd></div>
          </dl>
        </article>)}
      </div>
      <div>
        <section className="card summary">
          <div className="summary-line"><span>From your jars</span><strong>$44.63</strong></div>
          <div className="summary-line"><span>Fees</span><strong>$0.31 (0.7% · your limit 5%)</strong></div>
          <div className="meter" role="img" aria-label="Fees use 14% of your fee limit"><span style={{ width: "14%" }} /><i style={{ left: "100%" }} /></div>
          <p className="sub">Price protection 1% · if the price moves more, that jar waits</p>
        </section>
        <p className="fineprint">Shares go straight to your Solana wallet <span className="mono">7xQk…3mPt</span>.</p>
        <div className="dock">
          <ConfirmAction label="Buy now · $44.63" onConfirm={() => navigate("/buy/done")} />
          <p className="fineprint center"><ShieldCheck size={14} /> Buy 3 assets · up to $44.63 · max fees $2.23</p>
        </div>
      </div>
    </div>
  </div>;
}

export function BuyDone() {
  const { navigate } = useApp();
  useEffect(() => { haptic([12, 60, 12, 60, 24]); }, []);
  return <div className="page flow narrow">
    <FlowHead title="Buy done" back="/" />
    <div className="center celebrate">
      <div className="burst" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ "--a": `${i * 36}deg` } as React.CSSProperties} />)}<Coin3D size={132} /></div>
      <p className="kicker">In your wallet</p>
      <h1 className="h-hero">You bought<br />3 assets</h1>
      <p className="sub">Bought 3 assets · fees $0.31 · 6 Nov</p>
    </div>
    <div className="card list" style={{ marginTop: 28 }}>
      {holdings.slice(0, 3).map((h, i) => <button className="row" key={h.id} onClick={() => navigate(`/holdings/${h.id}`)}>
        <Monogram tone={h.tone}><Check size={18} strokeWidth={2.6} /></Monogram>
        <span className="row-main"><span className="row-title">{h.name}</span><span className="row-sub">Bought at {["$296.31", "$283.72", "$2,947"][i]}</span></span>
        <span className="row-value">{["$33.25", "$6.03", "$5.04"][i]}</span>
      </button>)}
    </div>
    <div className="card summary" style={{ marginTop: 12 }}>
      <div className="summary-line"><span>Paid vs quote</span><strong>within 0.2%</strong></div>
      <div className="summary-line"><span>Left in jars</span><strong>$3.18</strong></div>
    </div>
    <div className="dock">
      <button className="button primary full lg" onClick={() => navigate("/holdings/apple")}>See what you own <ArrowRight size={18} /></button>
      <button className="button quiet full" onClick={() => navigate("/holdings/apple")}><Share2 size={16} /> Share what I own</button>
    </div>
  </div>;
}
