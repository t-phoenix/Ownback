"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { useApp } from "../app-context";
import { useSession } from "../session";
import { Logo } from "../logo";
import { Coin3D, Creative, Tilt, haptic } from "../ui";
import { ErrorState, Skeleton } from "../states";
import { api, ApiError } from "../../lib/api";
import { useApi } from "../../lib/use-api";
import { errorCopy } from "../../lib/copy";
import { C, fmtUsd, fmtUsd6, share } from "../../lib/money";
import { FlowHead } from "./home";

export function SignIn() {
  const { signIn, busy, error, configured } = useSession();
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
        <button className="button primary full lg" disabled={busy || !configured} onClick={() => { haptic(8); signIn(); }}><Mail size={18} /> {busy ? "Signing in…" : "Continue with Google"}</button>
        {!configured && <p className="error" role="alert">Sign-in isn't set up on this deployment yet.</p>}
        {configured && error && <p className="error" role="alert">{errorCopy(error)}</p>}
        <p className="fineprint center">By continuing you accept the <a href="/terms">Terms</a> · <a href="/risks">Risks</a></p>
      </div>
    </section>
  </div>;
}

const IPHONE = C(955);

export function Rules() {
  const { navigate } = useApp();
  const { refresh } = useSession();
  const rules = useApi("rules", api.rules);
  const [rate, setRate] = useState(5);
  const [limit, setLimit] = useState(50);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!rules.data) return;
    setRate(rules.data.rateBps / 100);
    setLimit(Number(BigInt(rules.data.monthlyCapUsd6) / 1_000_000n) || 50);
  }, [rules.data]);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api.putRules({ rateBps: rate * 100, monthlyCapUsd6: (BigInt(limit) * 1_000_000n).toString() });
      await refresh(); navigate("/funds");
    } catch (e) { setErr(errorCopy(e instanceof ApiError ? e.code : undefined)); setBusy(false); }
  };
  const r = rules.data;
  return <div className="page flow wide">
    <FlowHead title="Set your rules" kicker="Step 1 of 2" back="/signin" />
    <ErrorState error={rules.error} onRetry={rules.reload} />
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
        {!r ? <Skeleton h={200} /> : <div className="card list">
          <div className="row"><span className="row-main row-title">Max fees</span><span className="row-value soft">{r.maxFeeBps / 100}%</span></div>
          <div className="row"><span className="row-main row-title">Ready when</span><span className="row-value soft">{fmtUsd6(r.readyMinUsd6)}</span></div>
          <div className="row"><span className="row-main row-title">If a company isn't listed</span><span className="row-value soft">{r.fallbackAsset === "idx:sp500" ? "S&P 500" : r.fallbackAsset}</span></div>
        </div>}
        {err && <p className="error" role="alert">{err}</p>}
        <div className="dock">
          <button className="button primary full lg" disabled={busy || !r} onClick={save}>{busy ? "Saving…" : "Add $20 to start"} <ArrowRight size={18} /></button>
        </div>
      </div>
    </div>
  </div>;
}
