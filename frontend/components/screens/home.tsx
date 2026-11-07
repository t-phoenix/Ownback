"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Bell, BellRing, CheckCircle2, ChevronRight, CircleDollarSign, Gauge, Inbox, Mail, ReceiptText, Zap } from "lucide-react";
import { useApp } from "../app-context";
import { useSession } from "../session";
import { Logo } from "../logo";
import { CountUp, Creative, GlassJar, Monogram, SwipeDeck, Tilt } from "../ui";
import { Empty, ErrorState, Skeleton, SkeletonList } from "../states";
import { api, type ReceiptRow as Row } from "../../lib/api";
import { useApi } from "../../lib/use-api";
import { activityTitle } from "../../lib/copy";
import { assetName, toneFor } from "../../lib/assets";
import { centsOf, fmtUsd6, pct } from "../../lib/money";
import { ReceiptRow } from "./receipts";

/** Time-of-day greeting, resolved on the client so server and browser time zones never disagree. */
function useGreeting() {
  const [g, setG] = useState("Hello");
  useEffect(() => {
    const h = new Date().getHours();
    setG(h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
  }, []);
  return g;
}

/** Monday-first index of today, and which days this week had a receipt. */
function weekStrip(rows: Row[]) {
  const now = new Date();
  const today = (now.getDay() + 6) % 7;
  const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(now.getDate() - today);
  const added = Array(7).fill(false) as boolean[];
  for (const r of rows) {
    const d = new Date(`${r.date.slice(0, 10)}T00:00:00`);
    const i = Math.floor((d.getTime() - monday.getTime()) / 86_400_000);
    if (i >= 0 && i < 7) added[i] = true;
  }
  return { added, today, count: added.filter(Boolean).length };
}

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function Home() {
  const { navigate } = useApp();
  const { me } = useSession();
  const greeting = useGreeting();
  const home = useApi("home", api.home);
  const jars = useApi("jars", api.jars);
  const receipts = useApi("receipts:all", () => api.receipts("all"));
  const gmail = useApi("gmail", api.gmailState);

  const allRows = useMemo(() => receipts.data?.groups.flatMap(g => g.rows) ?? [], [receipts.data]);
  const week = weekStrip(allRows);
  const ready = (jars.data?.jars ?? []).filter(j => j.state === "ready");
  const review = allRows.filter(r => r.status === "needs_review");
  const b = home.data?.balance;
  const owned = centsOf(b?.byType.stocksCommodities), dollars = centsOf(b?.byType.stablecoins);
  const total = centsOf(b?.totalUsd6);
  const firstTime = home.data && home.data.stats.receipts === 0;

  const deck = [
    ...(ready.length ? [{ id: "jars", title: `${ready.length} jar${ready.length > 1 ? "s" : ""} ready`, body: "Review the prices and buy", cta: "Review", icon: <Zap size={18} />, meta: fmtUsd6(ready.reduce((s, j) => s + BigInt(j.amountUsd6), 0n)), path: "/jars" }] : []),
    ...(review.length ? [{ id: "review", title: activityTitle.needs_review, body: `${review[0].shop} receipt · ${review[0].item}`, cta: "Review", icon: <ReceiptText size={18} />, path: `/add/${review[0].id}` }] : []),
    ...(gmail.data?.state === "found" && gmail.data.newCount ? [{ id: "gmail", title: `${gmail.data.newCount} new invoices in Gmail`, body: (gmail.data.firstShops ?? []).join(" · "), cta: "Add them", icon: <Mail size={18} />, path: "/add" }] : []),
  ];

  return <div className="page page-home">
    <header className="topbar only-mobile">
      <Logo />
      <button className="icon-btn" aria-label="Activity" onClick={() => navigate("/activity")}><Bell size={20} /></button>
    </header>

    <div className="home-grid">
      <div className="home-main">
        <p className="kicker">{greeting}{me?.displayName && me.displayName !== "You" ? `, ${me.displayName}` : ""}</p>
        <ErrorState error={home.error} onRetry={home.reload} />

        {/* The vault: the one dark, heavy object on the page. Eye lands here first on both phone and desktop. */}
        <button className="vault" onClick={() => navigate("/holdings")} aria-label={`Total balance ${fmtUsd6(b?.totalUsd6)}. View holdings`}>
          <Tilt className="vault-art" strength={8}><Creative name="coin" priority /></Tilt>
          <span className="vault-label"><CircleDollarSign size={15} /> Total balance</span>
          {b ? <CountUp cents={total} className="vault-number" /> : <span className="vault-number skeleton-text">$—</span>}
          <span className="vault-split" aria-hidden="true"><span style={{ width: `${pct(owned, total || 1n)}%` }} /></span>
          <span className="vault-legend">
            <span><i className="sw own" />You own <b>{fmtUsd6(b?.byType.stocksCommodities)}</b></span>
            <span><i className="sw usd" />Dollars <b>{fmtUsd6(b?.byType.stablecoins)}</b></span>
          </span>
          <span className="vault-go"><ArrowUpRight size={18} /></span>
        </button>

        {firstTime ? <section className="block">
          <div className="first-run">
            <Creative name="shelf" className="first-run-art" />
            <div className="first-run-copy">
              <h2 className="h-title">Add your first purchase</h2>
              <p className="sub">Snap a receipt or an order screenshot. {dollars === 0n ? "Then add a few dollars so it has something to put to work." : "A small share goes into the companies behind it."}</p>
              <div className="btn-row">
                <button className="button primary" onClick={() => navigate("/add")}>Add a purchase</button>
                {dollars === 0n && <button className="button quiet" onClick={() => navigate("/funds")}>Add funds</button>}
              </div>
            </div>
          </div>
        </section> : <section className="block" aria-labelledby="waiting">
          <div className="block-head">
            <h2 id="waiting" className="h-section"><Inbox size={17} /> Waiting for you</h2>
            {deck.length > 0 && <span className="count-badge">{deck.length}</span>}
          </div>
          <SwipeDeck
            items={deck}
            onAct={item => navigate(deck.find(d => d.id === item.id)!.path)}
            empty={<div className="caught-up"><CheckCircle2 size={22} /><div><strong>You're all caught up</strong><span>We'll remind you on Sunday.</span></div></div>} />
        </section>}

        {!!jars.data?.jars.length && <section className="block" aria-labelledby="brands">
          <div className="block-head">
            <div>
              <h2 id="brands" className="h-section">Brands you buy, owned</h2>
              <p className="sub">Every shop you add becomes a company you own a piece of.</p>
            </div>
            <button className="link" onClick={() => navigate("/jars")}>All <ChevronRight size={15} /></button>
          </div>
          <div className="brand-rail h-scroll">
            {jars.data.jars.map(j => <button key={j.assetId} className="brand-card" onClick={() => navigate("/jars")}>
              <div className="brand-top">
                <Monogram name={assetName(j.assetId, j.name)} tone={toneFor(j.assetId)} size={40} />
                <span className={`state-chip ${j.state === "ready" ? "good" : "fill"}`}>{j.state === "ready" ? "Ready" : "Filling"}</span>
              </div>
              <strong className="brand-name">{assetName(j.assetId, j.name)}</strong>
              <span className="brand-own">{fmtUsd6(j.amountUsd6)}</span>
              <span className="brand-line">in its jar · {pct(BigInt(j.amountUsd6), BigInt(j.readyMinUsd6))}% of {fmtUsd6(j.readyMinUsd6)}</span>
            </button>)}
            <button className="brand-card add" onClick={() => navigate("/add")}>
              <span className="brand-plus">+</span>
              <strong className="brand-name">Next brand</strong>
              <span className="brand-line">Add a receipt to start owning it</span>
            </button>
          </div>
        </section>}
      </div>

      <div className="home-side">
        <section className="card ritual" aria-labelledby="ritual">
          <div className="ritual-head">
            <div><p className="micro">This week</p><h2 id="ritual" className="h-card">Buy day is Sunday</h2></div>
            <span className="ritual-icon"><BellRing size={18} /></span>
          </div>
          <ol className="week" aria-label="Days you added a receipt this week">
            {DAYS.map((d, i) => <li key={i} className={`${week.added[i] ? "on" : ""} ${i === week.today ? "today" : ""} ${i === 6 ? "sun" : ""}`}><span>{d}</span><i /></li>)}
          </ol>
          <p className="ritual-copy">{week.count ? `${week.count} ${week.count === 1 ? "day" : "days"} with a receipt this week.` : "No receipts yet this week."} Add the rest before Sunday and they're in this week's buy.</p>
        </section>

        <section className="card jars-peek" aria-labelledby="next">
          <div className="block-head tight">
            <h2 id="next" className="h-card">Next buy</h2>
            {ready.length > 0 && <span className="state-chip good"><Zap size={12} /> {ready.length} ready</span>}
          </div>
          {jars.loading ? <Skeleton h={90} /> : jars.data?.jars.length ? <div className="jar-row">
            {jars.data.jars.slice(0, 4).map(j => { const p = pct(BigInt(j.amountUsd6), BigInt(j.readyMinUsd6)); return <div key={j.assetId} className="jar-mini">
              <GlassJar pct={p} ready={j.state === "ready"} size={52} />
              <span className="jar-mini-name">{assetName(j.assetId, j.name)}</span>
              <span className="jar-mini-amt">{fmtUsd6(j.amountUsd6)}</span>
            </div>; })}
          </div> : <p className="sub" style={{ marginBottom: 14 }}>Your jars fill as you add purchases.</p>}
          <button className="button primary full" disabled={!ready.length} onClick={() => navigate("/jars")}>{ready.length ? `Review and buy ${ready.length} jar${ready.length > 1 ? "s" : ""}` : "Nothing ready yet"}</button>
          <p className="fineprint center">Nothing buys without your OK.</p>
        </section>

        <section className="block side-block" aria-labelledby="recent">
          <div className="block-head"><h2 id="recent" className="h-section">Recent receipts</h2><button className="link" onClick={() => navigate("/receipts")}>All <ChevronRight size={15} /></button></div>
          {home.loading ? <SkeletonList rows={2} /> : home.data?.recentReceipts.length
            ? <div className="card list">{home.data.recentReceipts.map(r => <ReceiptRow key={r.id} r={r} />)}</div>
            : <Empty title="No receipts yet" body="Snap one from the Add tab." />}
        </section>

        {receipts.data && receipts.data.stats.count > 0 && <div className="insight"><CircleDollarSign size={17} /><span>You've put <b>{fmtUsd6(receipts.data.stats.putToWorkUsd6)}</b> to work from <b>{receipts.data.stats.count}</b> receipts worth {fmtUsd6(receipts.data.stats.spentUsd6)}.</span></div>}
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
  const a = useApi("activity", api.activity);
  return <div className="page flow">
    <FlowHead title="Activity" back="/" />
    <ErrorState error={a.error} onRetry={a.reload} />
    {a.loading && <SkeletonList rows={4} />}
    {a.data && !a.data.groups.length && <Empty title="Nothing here yet" body="Receipts, jars and buys show up here as they happen." />}
    {a.data?.groups.map(g => <section key={g.label} className="block">
      <p className="micro">{g.label}</p>
      <div className="card list">
        {g.items.map(it => <button key={it.id} className={`row act-${it.kind}`} onClick={() => navigate(it.link || "/")}>
          <span className="act-icon">{activityIcon[it.kind] ?? <Bell size={17} />}</span>
          <span className="row-main"><span className="row-title">{activityTitle[it.kind] ?? it.title}</span>{it.body && <span className="row-sub wrap">{it.body}</span>}</span>
          <span className="row-end"><span className="row-sub">{new Date(it.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></span>
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
