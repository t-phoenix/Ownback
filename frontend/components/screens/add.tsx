"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Camera, Check, ChevronDown, FileText, Mail, Mic, ShieldCheck, Sparkles } from "lucide-react";
import { useApp } from "../app-context";
import { ConfirmAction, Creative, GlassJar, Monogram, Tilt, haptic, useCoarse } from "../ui";
import { split } from "../../lib/fixtures";
import { FlowHead } from "./home";

export function AddPurchase() {
  const { navigate } = useApp();
  const coarse = useCoarse();
  const file = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return <div className="page page-add">
    <header className="page-head"><div><p className="kicker">Add</p><h1 className="h-page">A purchase</h1></div></header>

    <div className="add-layout">
      {/* Primary action: biggest, lowest on the phone (thumb), first in reading order on desktop. */}
      <button className={`capture ${over ? "over" : ""}`} onClick={() => { haptic(8); file.current?.click(); }}
        onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}>
        <Tilt className="capture-art" strength={7}><Creative name="receipt" /></Tilt>
        <span className="capture-icon"><Camera size={22} /></span>
        <span className="capture-title">Snap or upload</span>
        <span className="capture-sub">{coarse ? "A receipt or order screenshot" : "Drop a receipt here, or paste a screenshot with ⌘V"}</span>
        <span className="capture-go" aria-hidden="true"><ArrowRight size={20} /></span>
      </button>
      <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={() => navigate("/add/reading")} />

      <div className="add-side">
        <div className="add-pair">
          <button className="mini-action" onClick={() => navigate("/add/reading")}><span className="mini-icon"><Mic size={20} /></span><strong>Say it</strong><span className="sub">Record a voice note</span></button>
          <button className="mini-action" onClick={() => navigate("/add/confirm")}><span className="mini-icon"><FileText size={20} /></span><strong>Type it</strong><span className="sub">Enter the details</span></button>
        </div>

        <section className="card gmail">
          <div className="gmail-top">
            <span className="mini-icon"><Mail size={20} /></span>
            <div className="row-main"><div className="row-title">Connect Gmail</div><div className="row-sub wrap">Find invoices in your inbox automatically. Pick a Google account; we only look at emails from shops.</div></div>
          </div>
          <button className="button secondary full">Connect Gmail</button>
        </section>
      </div>
    </div>

    <p className="fineprint center"><ShieldCheck size={14} /> Receipts and emails are read by a private AI model on 0G and not stored. Only shop, item, amount and date are kept.</p>
  </div>;
}

const steps = ["Read the receipt · Croma, 3 Nov", "Converted ₹79,900 → $955.00 (₹83.66/$)", "Found the maker · Apple", "Finding companies behind it", "Checking which ones you can buy"];

export function Reading() {
  const { navigate } = useApp();
  const [done, setDone] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setDone(d => {
      if (d >= steps.length) { clearInterval(t); setTimeout(() => navigate("/add/confirm"), 600); return d; }
      haptic(4); return d + 1;
    }), 700);
    return () => clearInterval(t);
  }, [navigate]);
  return <div className="page flow narrow">
    <FlowHead title="Reading your receipt" back="/add" />
    <div className="scan">
      <Creative name="receipt" className="scan-img" priority />
      <span className="scan-line" aria-hidden="true" />
    </div>
    <h2 className="h-title center">Finding what's inside</h2>
    <p className="sub center">This usually takes a few seconds.</p>
    <ol className="steps" aria-live="polite">
      {steps.map((s, i) => <li key={s} className={i < done ? "done" : i === done ? "now" : ""}>
        <span className="step-dot">{i < done ? <Check size={14} strokeWidth={2.6} /> : i === done ? <Sparkles size={13} className="spin" /> : null}</span>
        <span>{s}</span>
      </li>)}
    </ol>
    <p className="fineprint center">Read by a private AI model on 0G. The photo is deleted after reading.<br /><span className="mono">Request ID 7f3a…9c2</span></p>
  </div>;
}

const segColor = (s: typeof split[number]) => s.role === "Maker" ? "seg-maker" : s.role === "Material" ? "seg-material" : "seg-behind";

export function Confirm() {
  const { navigate } = useApp();
  const [on, setOn] = useState(() => new Set(split.map(s => s.name)));
  const [why, setWhy] = useState(false);
  const toggle = (n: string) => { haptic(5); setOn(prev => { const x = new Set(prev); if (x.has(n)) x.delete(n); else x.add(n); return x; }); };
  return <div className="page flow wide">
    <FlowHead title="Confirm purchase" back="/add" />
    <div className="two-col">
      <div>
        <section className="card product">
          <div className="product-art" aria-hidden="true"><span /></div>
          <div className="row-main"><p className="micro">Croma · 3 Nov</p><h2 className="h-card big">iPhone 16 Pro</h2><p className="sub">₹79,900 → $955.00</p></div>
          <div className="product-share"><span className="micro">Your 5%</span><strong>$47.75</strong></div>
        </section>

        <div className="block-head block">
          <div><p className="micro">The match</p><h2 className="h-section">What's inside your iPhone</h2></div>
          <button className="link">Edit split</button>
        </div>
        <div className="splitbar" role="img" aria-label="70% maker, 20% behind it, 10% materials">
          {split.map(s => <span key={s.name} className={segColor(s)} style={{ flexGrow: s.pct, opacity: on.has(s.name) ? 1 : .25 }} />)}
        </div>
        <p className="split-legend"><span><i className="seg-maker" />70% maker</span><span><i className="seg-behind" />20% behind it</span><span><i className="seg-material" />10% materials</span></p>
      </div>

      <div>
        <div className="card list">
          {split.map(s => <label key={s.name} className="row split-row">
            <input type="checkbox" className="tick" checked={on.has(s.name)} onChange={() => toggle(s.name)} />
            <Monogram name={s.name} tone={s.tone} size={38} />
            <span className="row-main"><span className="row-title">{s.name}</span><span className="role">{s.role}</span></span>
            <span className="row-end"><span className="row-value">{s.amount}</span>{s.ready && <span className="row-sub pos">Jar ready</span>}</span>
          </label>)}
        </div>
        <button className="disclose" aria-expanded={why} onClick={() => setWhy(!why)}>Why these companies? <ChevronDown size={16} /></button>
        {why && <p className="why">Maker: iPhone 16 Pro → Apple (Wikidata). Suppliers: from public supplier lists, with the quoted sentence. Materials: from the product's bill of materials. <span className="mono">AI request ID: 7f3a…9c2</span></p>}
        <p className="fee"><ShieldCheck size={15} /> Network fee $0.00 · we cover it</p>
        <div className="dock">
          <ConfirmAction label={`Confirm $47.75 across ${on.size}`} onConfirm={() => navigate("/add/saved")} />
          <div className="dock-row">
            <button className="button quiet">Only Apple</button>
            <button className="button quiet" onClick={() => navigate("/add/confirm")}>Wrong product? Fix it</button>
          </div>
        </div>
      </div>
    </div>
  </div>;
}

export function Saved() {
  const { navigate } = useApp();
  useEffect(() => { haptic([10, 50, 14]); }, []);
  return <div className="page flow narrow center celebrate">
    <div className="celebrate-stage" aria-hidden="true">
      <span className="falling f1" /><span className="falling f2" /><span className="falling f3" />
      <GlassJar pct={100} ready size={120} />
    </div>
    <p className="kicker">Purchase saved</p>
    <h1 className="h-hero">$47.75 is in<br />6 jars</h1>
    <p className="lede">Apple's jar is ready. Tap to buy when you want. TSMC, Qualcomm, Corning, Gold and Silver fill up from your next purchases. We'll remind you on Sunday.</p>
    <div className="card summary">
      <div className="summary-line"><span>Apple</span><strong>$33.43 · ready</strong></div>
      <div className="summary-line"><span>5 more jars</span><strong>$14.32 · filling</strong></div>
    </div>
    <div className="dock">
      <button className="button primary full lg" onClick={() => navigate("/jars")}>View your jars <ArrowRight size={18} /></button>
      <div className="dock-row">
        <button className="button quiet" onClick={() => navigate("/add", { dir: "back" })}>Add another purchase</button>
        <button className="button quiet" onClick={() => navigate("/", { dir: "back" })}>Go home</button>
      </div>
    </div>
  </div>;
}

