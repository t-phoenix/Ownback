"use client";

import { useState } from "react";
import { Check, ChevronRight, CircleDollarSign, Clock3, Copy, Eye, EyeOff, Share2 } from "lucide-react";
import { useApp } from "../app-context";
import { Logo } from "../logo";
import { Creative, Money, Monogram, Tilt } from "../ui";
import { brands, holdings, totals } from "../../lib/fixtures";
import { pct } from "../../lib/money";
import { FlowHead } from "./home";

type H = typeof holdings[number];

export function HoldingRow({ h }: { h: H }) {
  const { navigate } = useApp();
  return <button className="row" onClick={() => navigate(`/holdings/${h.id}`)}>
    <Monogram name={h.name} tone={h.tone} />
    <span className="row-main"><span className="row-title">{h.name}</span><span className="row-sub">{h.qty} {h.token}</span></span>
    <span className="row-end"><span className="row-value">{h.value}</span><span className="row-sub">In your wallet</span></span>
    <ChevronRight size={16} className="row-chev" />
  </button>;
}

const filters = ["All", "Companies", "Materials", "Solana"];

export function Holdings() {
  const { navigate } = useApp();
  const [f, setF] = useState("All");
  const shown = holdings.filter(h => f === "All" || f === "Solana" || (f === "Companies" ? h.kind === "Company" : h.kind === "Material"));
  return <div className="page">
    <header className="page-head">
      <div><p className="kicker">Your portfolio</p><h1 className="h-page">Holdings</h1></div>
      <button className="link" onClick={() => navigate("/settings")}>Wallet <ChevronRight size={15} /></button>
    </header>

    <section className="card alloc" aria-label="What you own, by asset">
      <div className="alloc-top">
        <div><p className="micro">You own</p><Money cents={totals.owned} className="alloc-num" /><p className="sub">Across 11 assets</p></div>
        <div className="alloc-right"><p className="micro">Dollars</p><Money cents={totals.dollars} className="alloc-num muted-num" /><p className="sub">Free + in jars</p></div>
      </div>
      <div className="alloc-bar" role="img" aria-label={holdings.map(h => `${h.name} ${h.value}`).join(", ")}>
        {holdings.map(h => <span key={h.id} className={`tone-bg-${h.tone}`} style={{ flexGrow: Number(h.valueC) }} />)}
      </div>
      <ul className="alloc-legend">
        {holdings.map(h => <li key={h.id}><i className={`tone-bg-${h.tone}`} />{h.name}<b>{pct(h.valueC, totals.owned)}%</b></li>)}
      </ul>
    </section>

    <div className="chips h-scroll" role="tablist" aria-label="Filter">
      {filters.map(x => <button key={x} role="tab" aria-selected={f === x} className={`chip ${f === x ? "on" : ""}`} onClick={() => setF(x)}>{x}</button>)}
    </div>

    <div className="two-col">
      <section className="block" aria-labelledby="own">
        <div className="block-head"><h2 id="own" className="h-section">What you own</h2><span className="sub">Updated just now</span></div>
        <div className="card list">{shown.map(h => <HoldingRow key={h.id} h={h} />)}</div>
      </section>
      <section className="block" aria-labelledby="usd">
        <div className="block-head"><h2 id="usd" className="h-section">Your dollars</h2></div>
        <div className="card list">
          <button className="row" onClick={() => navigate("/funds")}><Monogram tone="green">$</Monogram><span className="row-main"><span className="row-title">Free to use</span><span className="row-sub">Across 4 chains</span></span><span className="row-value">$64.12</span><ChevronRight size={16} className="row-chev" /></button>
          <button className="row" onClick={() => navigate("/jars")}><Monogram tone="gold"><CircleDollarSign size={19} /></Monogram><span className="row-main"><span className="row-title">Waiting in jars</span><span className="row-sub">3 ready · 4 filling</span></span><span className="row-value">$43.63</span><ChevronRight size={16} className="row-chev" /></button>
        </div>
      </section>
    </div>
  </div>;
}

export function Holding({ id }: { id: string }) {
  const { notify } = useApp();
  const h = holdings.find(x => x.id === id) ?? holdings[0];
  const b = brands.find(x => x.id === h.id);
  const [hide, setHide] = useState(true);
  const proof = ["Receipt matched to " + h.name, "Dollars moved into your jar", `${h.name} bought at $296.31`, "Ownership record published"];
  return <div className="page flow wide">
    <FlowHead title={h.name} kicker={h.token} back="/holdings" />
    <div className="two-col">
      <div>
        <section className="card holding-hero">
          <Monogram name={h.name} tone={h.tone} size={60} />
          <div><p className="micro">{h.name} · {h.token}</p><Money cents={h.valueC} className="holding-num" /><p className="sub">{h.qty} {h.token} in your wallet</p></div>
        </section>

        {b && <section className="card versus" aria-label="Spent versus owned">
          <p className="versus-copy">You spent <b>{b.spent}</b> on {h.name} this year. You now own <b className="pos">{b.own}</b> of {h.name}.</p>
          <div className="versus-bars">
            <div><span className="sub">Spent</span><span className="vbar"><i style={{ width: "100%" }} /></span><b>{b.spent}</b></div>
            <div><span className="sub">Own</span><span className="vbar own"><i style={{ width: `${Math.max(2, pct(b.ownC, b.spentC))}%` }} /></span><b>{b.own}</b></div>
          </div>
        </section>}

        <section className="block" aria-labelledby="proof">
          <h2 id="proof" className="h-section">Proof trail for the last buy</h2>
          <ol className="timeline card">
            {proof.map((s, i) => <li key={s} className={i === 3 ? "pending" : ""}>
              <span className="tl-dot">{i === 3 ? <Clock3 size={13} /> : <Check size={13} strokeWidth={2.6} />}</span>
              <span className="row-main"><span className="row-title">{s}</span><span className={`row-sub ${i === 0 ? "mono" : ""}`}>{i === 0 ? "0G request 7f3a…9c2" : i === 3 ? "Pending · Arkiv write queued" : "View proof"}</span></span>
              <ChevronRight size={16} className="row-chev" />
            </li>)}
          </ol>
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
            <h3 className="share-line">I bought an iPhone.<br />Now I own a piece of {h.name}.</h3>
            {!hide && <p className="share-amt">{b?.own ?? h.value} of {h.name}</p>}
            <span className="share-logo"><Logo /></span>
          </div>
          <div className="btn-row">
            <button className="button secondary" onClick={() => notify("Share text copied")}><Copy size={16} /> Copy text</button>
            <button className="button quiet" onClick={() => { if (navigator.share) navigator.share({ text: `I bought an iPhone. Now I own a piece of ${h.name}.` }).catch(() => {}); else notify("Share card ready"); }}><Share2 size={16} /> More</button>
          </div>
        </section>
        <p className="fineprint">{h.token} is issued by a third party; it tracks {h.name} stock but is not a share registered in your name.</p>
      </div>
    </div>
  </div>;
}
