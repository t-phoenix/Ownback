"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Bell, BellRing, CheckCircle2, ChevronRight, CircleDollarSign, Gauge, Inbox, Mail, ReceiptText, Sparkles, Zap } from "lucide-react";
import { useApp } from "../app-context";
import { Logo } from "../logo";
import { CountUp, Creative, GlassJar, Money, Monogram, SwipeDeck, Tilt } from "../ui";
import { activity, brands, holdings, inbox, jars, READY_MIN, receipts, totals, week } from "../../lib/fixtures";
import { pct, pct1 } from "../../lib/money";
import { ReceiptRow } from "./receipts";
import { HoldingRow } from "./holdings";

/** Time-of-day greeting, resolved on the client so server and browser time zones never disagree. */
function useGreeting() {
  const [g, setG] = useState("Hello");
  useEffect(() => {
    const h = new Date().getHours();
    setG(h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
  }, []);
  return g;
}

const deckIcon: Record<string, React.ReactNode> = {
  buy_reminder: <Zap size={18} />, needs_review: <ReceiptText size={18} />, gmail_found: <Mail size={18} />,
};

export function Home() {
  const { navigate } = useApp();
  const greeting = useGreeting();
  const ownedPct = pct(totals.owned, totals.balance);
  const ready = jars.filter(j => j.amountC >= READY_MIN);
  return <div className="page page-home">
    <header className="topbar only-mobile">
      <Logo />
      <button className="icon-btn" aria-label="Activity, 3 new" onClick={() => navigate("/activity")}><Bell size={20} /><span className="dot" /></button>
    </header>

    <div className="home-grid">
      <div className="home-main">
        <p className="kicker">{greeting}, Abhi</p>

        {/* The vault: the one dark, heavy object on the page. Eye lands here first on both phone and desktop. */}
        <button className="vault" onClick={() => navigate("/holdings")} aria-label="Total balance $234.20. View holdings">
          <Tilt className="vault-art" strength={8}><Creative name="coin" priority /></Tilt>
          <span className="vault-label"><CircleDollarSign size={15} /> Total balance</span>
          <CountUp cents={totals.balance} className="vault-number" />
          <span className="vault-split" aria-hidden="true"><span style={{ width: `${ownedPct}%` }} /></span>
          <span className="vault-legend">
            <span><i className="sw own" />You own <b>$126.45</b></span>
            <span><i className="sw usd" />Dollars <b>$107.75</b></span>
          </span>
          <span className="vault-go"><ArrowUpRight size={18} /></span>
        </button>

        <section className="block" aria-labelledby="waiting">
          <div className="block-head">
            <h2 id="waiting" className="h-section"><Inbox size={17} /> Waiting for you</h2>
            <span className="count-badge">{inbox.length}</span>
          </div>
          <SwipeDeck
            items={inbox.map(i => ({ id: i.id, title: i.title, body: i.body, cta: i.cta, icon: deckIcon[i.kind], meta: i.amount }))}
            onAct={item => navigate(inbox.find(i => i.id === item.id)!.path)}
            empty={<div className="caught-up"><CheckCircle2 size={22} /><div><strong>You're all caught up</strong><span>We'll remind you on Sunday.</span></div></div>} />
        </section>

        <section className="block" aria-labelledby="brands">
          <div className="block-head">
            <div>
              <h2 id="brands" className="h-section">Brands you buy, owned</h2>
              <p className="sub">Every shop you add becomes a company you own a piece of.</p>
            </div>
            <button className="link" onClick={() => navigate("/holdings")}>All <ChevronRight size={15} /></button>
          </div>
          <div className="brand-rail h-scroll">
            {brands.map(b => <button key={b.id} className="brand-card" onClick={() => navigate(b.id === "apple" ? "/holdings/apple" : "/jars")}>
              <div className="brand-top">
                <Monogram name={b.name} tone={b.tone} size={40} />
                <span className={`state-chip ${b.state === "Owned" ? "good" : "fill"}`}>{b.state}</span>
              </div>
              <strong className="brand-name">{b.name}</strong>
              <span className="brand-own"><Money cents={b.ownC} /></span>
              <span className="brand-line">of {b.spent} spent · {pct1(b.ownC, b.spentC)}</span>
            </button>)}
            <button className="brand-card add" onClick={() => navigate("/add")}>
              <span className="brand-plus">+</span>
              <strong className="brand-name">Next brand</strong>
              <span className="brand-line">Add a receipt to start owning it</span>
            </button>
          </div>
        </section>

        <section className="block only-mobile" aria-labelledby="top">
          <div className="block-head"><h2 id="top" className="h-section">Top holdings</h2><button className="link" onClick={() => navigate("/holdings")}>See all 11 <ChevronRight size={15} /></button></div>
          <div className="card list">{holdings.slice(0, 3).map(h => <HoldingRow key={h.id} h={h} />)}</div>
        </section>
      </div>

      <div className="home-side">
        <section className="card ritual" aria-labelledby="ritual">
          <div className="ritual-head">
            <div>
              <p className="micro">This week</p>
              <h2 id="ritual" className="h-card">Buy day is Sunday</h2>
            </div>
            <span className="ritual-icon"><BellRing size={18} /></span>
          </div>
          <ol className="week" aria-label="Days you added a receipt this week">
            {week.days.map((d, i) => <li key={i} className={`${week.added[i] ? "on" : ""} ${i === week.today ? "today" : ""} ${i === 6 ? "sun" : ""}`}><span>{d}</span><i /></li>)}
          </ol>
          <p className="ritual-copy">{week.added.filter(Boolean).length} receipts this week. Add the rest before Sunday and they're in this week's buy.</p>
        </section>

        <section className="card jars-peek" aria-labelledby="next">
          <div className="block-head tight">
            <h2 id="next" className="h-card">Next buy</h2>
            <span className="state-chip good"><Zap size={12} /> {ready.length} jars ready</span>
          </div>
          <div className="jar-row">
            {jars.slice(0, 4).map(j => { const p = pct(j.amountC, READY_MIN); return <div key={j.id} className="jar-mini">
              <GlassJar pct={p} ready={p >= 100} size={52} />
              <span className="jar-mini-name">{j.name}</span>
              <span className="jar-mini-amt">{j.amount}</span>
            </div>; })}
          </div>
          <button className="button primary full" onClick={() => navigate("/jars")}>Review and buy {ready.length} jars</button>
          <p className="fineprint center">Nothing buys without your OK.</p>
        </section>

        <section className="block side-block" aria-labelledby="recent">
          <div className="block-head"><h2 id="recent" className="h-section">Recent receipts</h2><button className="link" onClick={() => navigate("/receipts")}>All <ChevronRight size={15} /></button></div>
          <div className="card list">{receipts.slice(0, 3).map(r => <ReceiptRow key={r.id} r={r} />)}</div>
        </section>

        <div className="insight"><Sparkles size={17} /><span>You spent <b>$955 on Apple</b> this year. You now own <b>$62.10</b> of Apple.</span></div>
      </div>
    </div>
  </div>;
}

const activityIcon: Record<string, React.ReactNode> = {
  jar_ready: <Zap size={17} />, receipt_matched: <ReceiptText size={17} />, needs_review: <Inbox size={17} />,
  deposit_added: <CircleDollarSign size={17} />, buy_done: <CheckCircle2 size={17} />, limit_warning: <Gauge size={17} />,
};

export function Activity() {
  const { navigate } = useApp();
  const groups = Array.from(new Set(activity.map(a => a.group)));
  return <div className="page flow">
    <FlowHead title="Activity" back="/" />
    {groups.map(g => <section key={g} className="block">
      <p className="micro">{g}</p>
      <div className="card list">
        {activity.filter(a => a.group === g).map(a => <button key={a.id} className={`row act-${a.kind}`} onClick={() => navigate(a.path)}>
          <span className="act-icon">{activityIcon[a.kind]}</span>
          <span className="row-main"><span className="row-title">{a.title}</span><span className="row-sub wrap">{a.body}</span></span>
          <span className="row-end"><span className="row-sub">{a.time}</span></span>
        </button>)}
      </div>
    </section>)}
  </div>;
}

export function FlowHead({ title, back, kicker }: { title: string; back: string; kicker?: string }) {
  const { navigate } = useApp();
  return <header className="flow-head">
    <button className="icon-btn" aria-label="Back" onClick={() => navigate(back, { dir: "back" })}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg></button>
    <div className="flow-title">{kicker && <span className="micro">{kicker}</span>}<h1>{title}</h1></div>
    <span className="flow-spacer" />
  </header>;
}
