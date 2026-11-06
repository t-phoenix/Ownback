"use client";

import { useState } from "react";
import { ArrowRight, ChevronRight, LockKeyhole, Mail } from "lucide-react";
import { useApp } from "../app-context";
import { Logo } from "../logo";
import { Coin3D, Creative, Tilt, haptic } from "../ui";
import { C, fmtUsd, share } from "../../lib/money";
import { FlowHead } from "./home";

export function SignIn() {
  const { navigate } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const continueGoogle = async () => {
    setBusy(true); setErr("");
    try {
      // MOCKS / no Privy dashboard yet: API MOCK_CHAIN derives wallets from the token (Q9).
      const { authPrivy } = await import("../../lib/api");
      await authPrivy(`mock_${Date.now()}`);
      navigate("/onboarding/rules");
    } catch {
      setErr("That didn't work. Try signing in again.");
      // Offline / API down: still allow the walkthrough on mocks.
      if (process.env.NEXT_PUBLIC_MOCKS !== "0") navigate("/onboarding/rules");
    } finally { setBusy(false); }
  };
  return <div className="welcome">
    <section className="welcome-art">
      <span className="welcome-logo"><Logo /></span>
      <Tilt className="welcome-coin" strength={9}><Creative name="coin" priority /></Tilt>
      <div className="float-receipt" aria-hidden="true">
        <span className="micro">Croma · iPhone</span>
        <strong>₹79,900 → $47.75</strong>
        <span className="mini-split"><i className="seg-maker" style={{ flexGrow: 70 }} /><i className="seg-behind" style={{ flexGrow: 20 }} /><i className="seg-material" style={{ flexGrow: 10 }} /></span>
        <span className="sub">Apple · TSMC · Corning · Gold</span>
      </div>
    </section>
    <section className="welcome-copy">
      <p className="kicker">Own what you buy.</p>
      <h1 className="h-display">Own a piece of what you buy.</h1>
      <p className="lede left">A small share of every purchase goes into the companies behind it.</p>
      <div className="welcome-actions">
        <button className="button primary full lg" disabled={busy} onClick={() => { haptic(8); continueGoogle(); }}><Mail size={18} /> {busy ? "Signing in…" : "Continue with Google"}</button>
        <button className="button quiet full" onClick={() => navigate("/onboarding/rules")}><LockKeyhole size={17} /> Use a seed phrase</button>
        {err && <p className="error" role="alert">{err}</p>}
        <p className="fineprint center">By continuing you accept the <a href="/terms">Terms</a> · <a href="/risks">Risks</a></p>
      </div>
    </section>
  </div>;
}

const IPHONE = C(955);

export function Rules() {
  const { navigate } = useApp();
  const [rate, setRate] = useState(5);
  const [limit, setLimit] = useState(50);
  return <div className="page flow wide">
    <FlowHead title="Set your rules" kicker="Step 1 of 2" back="/signin" />
    <div className="two-col">
      <div>
        <div className="rules-hero"><Coin3D size={96} /><div><h1 className="h-title">Make every purchase count.</h1><p className="sub">You can change these any time.</p></div></div>
        <section className="card rule">
          <div className="rule-head"><div><strong>How much of each purchase?</strong><p className="sub">Between 2% and 10%</p></div><span className="rule-value num">{rate}%</span></div>
          <input className="range" type="range" min={2} max={10} value={rate} onChange={e => { setRate(Number(e.target.value)); haptic(3); }} aria-label="Purchase rate" style={{ "--p": `${((rate - 2) / 8) * 100}%` } as React.CSSProperties} />
          <p className="example">$955 iPhone → <b>{fmtUsd(share(IPHONE, rate))}</b> into Apple and the companies behind it.</p>
        </section>
        <section className="card rule">
          <div className="rule-head"><div><strong>Monthly limit</strong><p className="sub">The vault enforces it</p></div><span className="rule-value num">${limit}</span></div>
          <input className="range" type="range" min={10} max={200} step={10} value={limit} onChange={e => { setLimit(Number(e.target.value)); haptic(3); }} aria-label="Monthly limit" style={{ "--p": `${((limit - 10) / 190) * 100}%` } as React.CSSProperties} />
        </section>
      </div>
      <div>
        <div className="card list">
          {[["Max fees", "5%"], ["Ready when", "$5"], ["If a company isn't listed", "S&P 500"]].map(([t, v]) =>
            <button key={t} className="row"><span className="row-main row-title">{t}</span><span className="row-value soft">{v}</span><ChevronRight size={16} className="row-chev" /></button>)}
        </div>
        <div className="dock">
          <button className="button primary full lg" onClick={() => navigate("/funds")}>Add $20 to start <ArrowRight size={18} /></button>
        </div>
      </div>
    </div>
  </div>;
}
