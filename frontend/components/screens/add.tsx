"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Camera, Check, ChevronDown, FileText, Mail, Mic, ShieldCheck, Sparkles, Square } from "lucide-react";
import { useApp } from "../app-context";
import { ConfirmAction, Creative, GlassJar, Monogram, Tilt, haptic, useCoarse } from "../ui";
import { ErrorState, Skeleton } from "../states";
import { api, ApiError, type Purchase } from "../../lib/api";
import { useApi, refreshAll } from "../../lib/use-api";
import { errorCopy, readErrorCopy, readTips } from "../../lib/copy";
import { setPending, takePending, type PendingRead } from "../../lib/pending";
import { signAction } from "../../lib/sign-action";
import { assetName, toneFor } from "../../lib/assets";
import { fmtLocal, fmtUsd6 } from "../../lib/money";
import { FlowHead } from "./home";

/** Start a read from anywhere (Add, desktop drop, paste). */
export function startRead(p: PendingRead, navigate: (p: string) => void) { setPending(p); navigate("/add/reading"); }

function useRecorder(onDone: (b: Blob) => void) {
  const rec = useRef<MediaRecorder | null>(null);
  const [on, setOn] = useState(false);
  const [err, setErr] = useState("");
  const start = async () => {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream); const chunks: Blob[] = [];
      r.ondataavailable = e => chunks.push(e.data);
      r.onstop = () => { stream.getTracks().forEach(t => t.stop()); setOn(false); onDone(new Blob(chunks, { type: r.mimeType || "audio/webm" })); };
      r.start(); rec.current = r; setOn(true); haptic(10);
    } catch { setErr("We need the microphone to record a voice note."); }
  };
  const stop = () => rec.current?.state === "recording" && rec.current.stop();
  return { on, err, start, stop };
}

export function AddPurchase() {
  const { navigate, notify } = useApp();
  const coarse = useCoarse();
  const file = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const gmail = useApi("gmail", api.gmailState);
  const voice = useRecorder(b => startRead({ kind: "audio", file: b, name: `note.${b.type.includes("mp4") ? "m4a" : "webm"}` }, navigate));
  const pick = (f?: File | null) => { if (f) startRead({ kind: "image", file: f, name: f.name || "receipt.jpg" }, navigate); };
  const connectGmail = async () => {
    try { const { authUrl } = await api.gmailConnect(); window.location.href = authUrl; }
    catch (e) { notify(errorCopy(e instanceof ApiError ? e.code : undefined)); }
  };
  const g = gmail.data;
  return <div className="page page-add">
    <header className="page-head"><div><p className="kicker">Add</p><h1 className="h-page">A purchase</h1></div></header>

    <div className="add-layout">
      {/* Primary action: biggest, lowest on the phone (thumb), first in reading order on desktop. */}
      <button className={`capture ${over ? "over" : ""}`} onClick={() => { haptic(8); file.current?.click(); }}
        onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); pick(e.dataTransfer.files[0]); }}>
        <Tilt className="capture-art" strength={7}><Creative name="receipt" /></Tilt>
        <span className="capture-icon"><Camera size={22} /></span>
        <span className="capture-title">Snap or upload</span>
        <span className="capture-sub">{coarse ? "A receipt or order screenshot" : "Drop a receipt here, or paste a screenshot with ⌘V"}</span>
        <span className="capture-go" aria-hidden="true"><ArrowRight size={20} /></span>
      </button>
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" hidden onChange={e => pick(e.target.files?.[0])} />

      <div className="add-side">
        <div className="add-pair">
          <button className={`mini-action ${voice.on ? "recording" : ""}`} onClick={() => (voice.on ? voice.stop() : voice.start())} aria-pressed={voice.on}>
            <span className="mini-icon">{voice.on ? <Square size={18} /> : <Mic size={20} />}</span>
            <strong>{voice.on ? "Recording…" : "Say it"}</strong><span className="sub">{voice.on ? "Tap to stop" : "Record a voice note"}</span>
          </button>
          <button className="mini-action" onClick={() => navigate("/add/type")}><span className="mini-icon"><FileText size={20} /></span><strong>Type it</strong><span className="sub">Enter the details</span></button>
        </div>
        {voice.err && <p className="error">{voice.err}</p>}

        {g && <section className="card gmail">
          <div className="gmail-top">
            <span className="mini-icon"><Mail size={20} /></span>
            <div className="row-main">
              {g.state === "none" && <><div className="row-title">Connect Gmail</div><div className="row-sub wrap">Find invoices in your inbox automatically. Pick a Google account; we only look at emails from shops.</div></>}
              {g.state === "no_access" && <><div className="row-title">Let us find your receipts</div><div className="row-sub wrap">You're signed in as {g.email}. Allow read-only access so we can find order emails from the last 30 days. We never send, delete or keep emails.</div></>}
              {g.state === "scanning" && <><div className="row-title">Looking through your inbox…</div><div className="row-sub wrap">Checking order emails from the last 30 days</div></>}
              {g.state === "found" && <><div className="row-title">{g.newCount} new invoices found</div><div className="row-sub wrap">{(g.firstShops ?? []).join(" · ")}</div></>}
              {g.state === "caught_up" && <><div className="row-title">You're all caught up</div><div className="row-sub wrap">We check again when you open the app.</div></>}
              {g.state === "revoked" && <><div className="row-title">Gmail disconnected</div><div className="row-sub wrap">Your past receipts stay. Reconnect to keep finding new ones.</div></>}
            </div>
          </div>
          {(g.state === "none" || g.state === "no_access" || g.state === "revoked") && <button className="button secondary full" onClick={connectGmail}>{g.state === "none" ? "Connect Gmail" : g.state === "revoked" ? "Reconnect" : "Allow read access"}</button>}
        </section>}
      </div>
    </div>

    <p className="fineprint center"><ShieldCheck size={14} /> Receipts and emails are read by a private AI model on 0G and not stored. Only shop, item, amount and date are kept.</p>
  </div>;
}

export function TypeIt() {
  const { navigate } = useApp();
  const [product, setProduct] = useState(""); const [amount, setAmount] = useState(""); const [currency, setCurrency] = useState("INR"); const [maker, setMaker] = useState("");
  const valid = product.trim().length > 0 && /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount) > 0;
  return <div className="page flow narrow">
    <FlowHead title="Type it" back="/add" />
    <form className="card form" onSubmit={e => { e.preventDefault(); if (valid) startRead({ kind: "typed", text: { product: product.trim(), amount, currency, ...(maker.trim() ? { maker: maker.trim() } : {}) } }, navigate); }}>
      <label className="field"><span>What did you buy?</span><input value={product} onChange={e => setProduct(e.target.value)} placeholder="iPhone 16 Pro" autoFocus /></label>
      <div className="field-row">
        <label className="field grow"><span>Amount paid</span><input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="79900" /></label>
        <label className="field"><span>Currency</span><select value={currency} onChange={e => setCurrency(e.target.value)}><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option></select></label>
      </div>
      {amount && !valid && <p className="error left">Enter an amount above $0.</p>}
      <label className="field"><span>Brand <em>(optional)</em></span><input value={maker} onChange={e => setMaker(e.target.value)} placeholder="Apple" /></label>
      <button className="button primary full lg" disabled={!valid}>Find the companies <ArrowRight size={18} /></button>
    </form>
  </div>;
}

const steps = ["Read the receipt", "Converted to dollars", "Found the maker", "Finding companies behind it", "Checking which ones you can buy"];

export function Reading() {
  const { navigate } = useApp();
  const [done, setDone] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);
  const [req, setReq] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; started.current = true;
    const p = takePending();
    if (!p) { navigate("/add", { dir: "back" }); return; }
    // Steps tick while 0G works (p50 ≈ 5–10 s); the last one waits for the real answer.
    const t = setInterval(() => setDone(d => { if (d < steps.length - 1) { haptic(4); return d + 1; } return d; }), 1800);
    (async () => {
      try {
        const { purchaseId } = p.kind === "typed" ? await api.createPurchaseTyped(p.text) : await api.createPurchaseMedia(p.kind === "image" ? "image" : "audio", p.file, p.name);
        let pur: Purchase = await api.purchase(purchaseId);
        for (let i = 0; pur.status === "reading" && i < 40; i++) { await new Promise(r => setTimeout(r, 700)); pur = await api.purchase(purchaseId); }
        setReq(pur.ogRequestIds[0] ?? null);
        clearInterval(t); setDone(steps.length); refreshAll();
        setTimeout(() => navigate(pur.status === "read_failed" ? "/add/error" : `/add/${purchaseId}`), 450);
      } catch (e) { clearInterval(t); setError(e instanceof ApiError ? e : new ApiError("UPSTREAM", 0)); }
    })();
    return () => clearInterval(t);
  }, [navigate]);
  return <div className="page flow narrow">
    <FlowHead title="Reading your receipt" back="/add" />
    <div className="scan"><Creative name="receipt" className="scan-img" priority /><span className="scan-line" aria-hidden="true" /></div>
    <h2 className="h-title center">Finding what's inside</h2>
    <p className="sub center">This usually takes a few seconds.</p>
    <ErrorState error={error} onRetry={() => navigate("/add", { dir: "back" })} />
    <ol className="steps" aria-live="polite">
      {steps.map((s, i) => <li key={s} className={i < done ? "done" : i === done ? "now" : ""}>
        <span className="step-dot">{i < done ? <Check size={14} strokeWidth={2.6} /> : i === done ? <Sparkles size={13} className="spin" /> : null}</span>
        <span>{s}</span>
      </li>)}
    </ol>
    <p className="fineprint center">Read by a private AI model on 0G. The photo is deleted after reading.{req && <><br /><span className="mono">Request ID {req.slice(0, 4)}…{req.slice(-3)}</span></>}</p>
  </div>;
}

export function ReadError() {
  const { navigate } = useApp();
  return <div className="page flow narrow center">
    <FlowHead title="Couldn't read" back="/add" />
    <div className="scan dim"><Creative name="receipt" className="scan-img" /></div>
    <p className="lede">{readErrorCopy}</p>
    <ul className="tips">{readTips.map(t => <li key={t}>{t}</li>)}</ul>
    <div className="dock">
      <button className="button primary full lg" onClick={() => navigate("/add", { dir: "back" })}>Retake photo</button>
      <button className="button quiet full" onClick={() => navigate("/add/type")}>Type it instead</button>
    </div>
  </div>;
}

const roleLabel: Record<string, string> = { maker: "Maker", supplier: "Behind it", material: "Material", fallback: "Fallback" };
const segClass = (role: string) => role === "maker" || role === "fallback" ? "seg-maker" : role === "material" ? "seg-material" : "seg-behind";

export function Confirm({ id }: { id: string }) {
  const { navigate } = useApp();
  const p = useApi(`purchase:${id}`, () => api.purchase(id));
  const home = useApi("home", api.home);
  const rules = useApi("rules", api.rules);
  const [why, setWhy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shortfall, setShortfall] = useState<{ freeUsd6: string; shortUsd6: string } | null>(null);
  const [limitLeft, setLimitLeft] = useState<string | null>(null);
  const data = p.data;
  const toggle = async (assetId: string) => {
    if (!data) return; haptic(5);
    const off = data.allocations.filter(a => (a.assetId === assetId ? a.selected : !a.selected)).map(a => a.assetId);
    try { await api.deselect(id, off); await p.reload(); } catch (e) { setErr(errorCopy(e instanceof ApiError ? e.code : undefined)); }
  };
  const confirm = async (amountUsd6?: string) => {
    setBusy(true); setErr(null);
    try {
      const { action } = await api.confirm(id, amountUsd6);
      const signed = await signAction(action);
      await api.confirmSubmitted(id, signed.txHash);
      refreshAll(); navigate(`/add/${id}/saved`);
    } catch (e) {
      const ae = e instanceof ApiError ? e : null;
      const details = ae?.details as { freeUsd6?: string; shortUsd6?: string; leftUsd6?: string } | undefined;
      if (ae?.code === "INSUFFICIENT_FREE" && details?.freeUsd6 && details?.shortUsd6) {
        setShortfall({ freeUsd6: details.freeUsd6, shortUsd6: details.shortUsd6 });
        setErr(errorCopy(ae.code, details));
      } else if (ae?.code === "LIMIT_REACHED" && details?.leftUsd6) {
        setLimitLeft(details.leftUsd6);
        setErr(errorCopy(ae.code, details));
      } else {
        setErr(errorCopy(ae?.code));
      }
      setBusy(false);
    }
  };
  if (p.error) return <div className="page flow"><FlowHead title="Confirm purchase" back="/add" /><ErrorState error={p.error} onRetry={p.reload} /></div>;
  if (!data) return <div className="page flow"><FlowHead title="Confirm purchase" back="/add" /><Skeleton h={110} /><Skeleton h={260} mt={18} /></div>;

  const r = data.receipt;
  const selected = data.allocations.filter(a => a.selected);
  const total = selected.reduce((s, a) => s + BigInt(a.amountUsd6), 0n);
  const freeUsd6 = home.data?.balance.usdc.freeUsd6 ?? shortfall?.freeUsd6;
  const free = freeUsd6 ? BigInt(freeUsd6) : null;
  // Floor free to whole cents so partial confirm matches D18.
  const freeCents = free != null ? (free / 10_000n) * 10_000n : null;
  // shortcut: fall back to monthlyCap when used is unknown; LIMIT_REACHED sets limitLeft
  const leftCap = BigInt(limitLeft ?? data.limit?.leftUsd6 ?? rules.data?.monthlyCapUsd6 ?? total.toString());
  // Save what you can: min(free, monthly left, invest).
  let available = total;
  if (freeCents != null && freeCents < available) available = freeCents;
  if (leftCap < available) available = leftCap;
  const canPartial = available > 0n && available < total;
  const shortUsd6 = shortfall?.shortUsd6 ?? (freeCents != null && freeCents < total ? (total - freeCents).toString() : null);
  const maker = data.allocations.find(a => a.role === "maker");
  const done = data.status === "saved" || data.status === "confirming";
  return <div className="page flow wide">
    <FlowHead title={data.status === "not_listed" ? "Brand not listed" : "Confirm purchase"} back="/add" />
    <div className="two-col">
      <div>
        <section className="card product">
          <div className="product-art" aria-hidden="true"><span /></div>
          <div className="row-main"><p className="micro">{[r?.shop, r?.date ? new Date(r.date).toLocaleDateString([], { day: "numeric", month: "short" }) : ""].filter(Boolean).join(" · ")}</p><h2 className="h-card big">{r?.items[0] ?? "Purchase"}</h2>{r && <p className="sub">{fmtLocal(r.local.amount, r.local.currency)}{r.local.currency !== "USD" ? ` → ${fmtUsd6(r.amountUsd6)}` : ""}</p>}</div>
          <div className="product-share"><span className="micro">Your {(data.rateBps ?? 500) / 100}%</span><strong>{fmtUsd6(data.investUsd6)}</strong></div>
        </section>

        {data.status === "not_listed" && <div className="insight"><span>This brand has no shares to buy yet, so your {(data.rateBps ?? 500) / 100}% ({fmtUsd6(data.investUsd6)}) can go to your fallback instead.</span></div>}
        {data.status === "needs_review" && <div className="insight"><span>We're not sure about one of these companies. Check the match before you confirm.</span></div>}
        {canPartial && <div className="insight"><span>
          {shortUsd6
            ? `You have ${fmtUsd6(freeCents)} free. Add ${fmtUsd6(shortUsd6)} or save ${fmtUsd6(available)} now and the rest later.`
            : `Monthly room left is ${fmtUsd6(available)}. Save that now and the rest next month.`}
        </span></div>}

        <div className="block-head block">
          <div><p className="micro">The match</p><h2 className="h-section">Where your {fmtUsd6(data.investUsd6)} goes</h2></div>
        </div>
        <div className="splitbar" role="img" aria-label={data.allocations.map(a => `${assetName(a.assetId, a.name)} ${fmtUsd6(a.amountUsd6)}`).join(", ")}>
          {data.allocations.map(a => <span key={a.assetId} className={segClass(a.role)} style={{ flexGrow: Number(BigInt(a.amountUsd6) / 10_000n) || 1, opacity: a.selected ? 1 : .25 }} />)}
        </div>
        {data.split && <p className="split-legend"><span><i className="seg-maker" />{data.split.maker}% maker</span><span><i className="seg-behind" />{data.split.behind}% behind it</span><span><i className="seg-material" />{data.split.materials}% materials</span></p>}
      </div>

      <div>
        <div className="card list">
          {data.allocations.map(a => <label key={a.assetId} className="row split-row">
            <input type="checkbox" className="tick" checked={a.selected} disabled={done || data.allocations.length === 1} onChange={() => toggle(a.assetId)} />
            <Monogram name={assetName(a.assetId, a.name)} tone={toneFor(a.assetId)} size={38} />
            <span className="row-main"><span className="row-title">{assetName(a.assetId, a.name)}</span><span className="role">{roleLabel[a.role] ?? a.role}</span></span>
            <span className="row-end"><span className="row-value">{fmtUsd6(a.amountUsd6)}</span></span>
          </label>)}
        </div>
        <button className="disclose" aria-expanded={why} onClick={() => setWhy(!why)}>Why these companies? <ChevronDown size={16} /></button>
        {why && <div className="why">
          {data.allocations.filter(a => a.why).map(a => <p key={a.assetId}><b>{assetName(a.assetId, a.name)}:</b> {a.why}</p>)}
          {!!data.ogRequestIds.length && <p className="mono">AI request ID: {data.ogRequestIds.map(x => `${x.slice(0, 4)}…${x.slice(-3)}`).join(", ")}</p>}
          {!data.ogRequestIds.length && data.source === "typed" && <p className="sub">Typed entry — matched from the company registry (no receipt AI read).</p>}
        </div>}
        <p className="fee"><ShieldCheck size={15} /> Network fee $0.00 · we cover it</p>
        {err && <p className="error" role="alert">{err}</p>}
        {done ? <div className="dock"><button className="button primary full lg" onClick={() => navigate("/jars")}>View your jars</button></div>
          : <div className="dock">
              {busy ? <button className="button primary full lg" disabled>Saving… usually 2 s</button>
                : canPartial
                  ? <>
                      <ConfirmAction label={`Save ${fmtUsd6(available)} now`} onConfirm={() => confirm(available.toString())} />
                      {shortUsd6 && <button className="button secondary full" onClick={() => navigate("/funds")}>Add {fmtUsd6(shortUsd6)}</button>}
                    </>
                  : <ConfirmAction label={`Confirm ${fmtUsd6(total)} across ${selected.length}`} onConfirm={() => confirm()} />}
              <div className="dock-row">
                {maker && data.allocations.length > 1 && data.split && <button className="button quiet" onClick={async () => { await api.makerOnly(id, data.split!).catch(() => {}); p.reload(); }}>Only {assetName(maker.assetId, maker.name)}</button>}
                {data.status === "not_listed" && <button className="button quiet" onClick={async () => { await api.fallback(id, "skip").catch(() => {}); refreshAll(); navigate("/", { dir: "back" }); }}>Skip this purchase</button>}
              </div>
            </div>}
      </div>
    </div>
  </div>;
}

export function Saved({ id }: { id: string }) {
  const { navigate } = useApp();
  const p = useApi(`purchase:${id}`, () => api.purchase(id));
  useEffect(() => { haptic([10, 50, 14]); }, []);
  const sel = p.data?.allocations.filter(a => a.selected) ?? [];
  const maker = sel.find(a => a.role === "maker") ?? sel[0];
  return <div className="page flow narrow center celebrate">
    <div className="celebrate-stage" aria-hidden="true">
      <span className="falling f1" /><span className="falling f2" /><span className="falling f3" />
      <GlassJar pct={100} ready size={120} />
    </div>
    <p className="kicker">Purchase saved</p>
    <h1 className="h-hero">{fmtUsd6(p.data?.investUsd6)} is in<br />{sel.length || "your"} jar{sel.length === 1 ? "" : "s"}</h1>
    {maker && <p className="lede">{assetName(maker.assetId, maker.name)}'s jar fills up from your next purchases. We'll remind you on Sunday.</p>}
    {!!sel.length && <div className="card summary">{sel.map(a => <div key={a.assetId} className="summary-line"><span>{assetName(a.assetId, a.name)}</span><strong>{fmtUsd6(a.amountUsd6)}</strong></div>)}</div>}
    <div className="dock">
      <button className="button primary full lg" onClick={() => navigate("/jars")}>View your jars <ArrowRight size={18} /></button>
      <div className="dock-row">
        <button className="button quiet" onClick={() => navigate("/add", { dir: "back" })}>Add another purchase</button>
        <button className="button quiet" onClick={() => navigate("/", { dir: "back" })}>Go home</button>
      </div>
    </div>
  </div>;
}
