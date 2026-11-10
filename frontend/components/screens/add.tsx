"use client";

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, Camera, Check, ChevronDown, FileText, Lock, LockOpen, Mail, Mic, Plus, ShieldCheck, Sparkles, Square, Trash2, X } from "lucide-react";
import { useApp } from "../app-context";
import { ConfirmAction, Creative, GlassJar, Money, Monogram, Tilt, haptic, useCoarse } from "../ui";
import { ErrorState, Skeleton } from "../states";
import { api, ApiError, type Allocation, type DetailField, type JuryRow, type Purchase, type PurchaseDetails, type ReadStep } from "../../lib/api";
import { useApi, refreshAll } from "../../lib/use-api";
import { errorCopy, readErrorCopy, readErrorText, readTips } from "../../lib/copy";
import { lastRead, setLastRead, setPending, takePending, type PendingRead } from "../../lib/pending";
import { signAction } from "../../lib/sign-action";
import { assetName, toneFor } from "../../lib/assets";
import { centsOf, fmtLocal, fmtUsd, fmtUsd6, pct1 } from "../../lib/money";
import { parseDollars, roundNice, spread, stepFor, sumOf, type Cents } from "../../lib/amounts";
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

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "JPY", "CAD", "AUD"];
const money = /^\d+(\.\d{1,2})?$/;
type ItemDraft = { name: string; brand: string; model: string; category: string; qty: string; lineTotal: string };
const toDraft = (i?: Partial<PurchaseDetails["items"][number]>): ItemDraft => ({ name: i?.name ?? "", brand: i?.brand ?? "", model: i?.model ?? "", category: i?.category ?? "", qty: String(i?.qty ?? 1), lineTotal: i?.lineTotal ?? "" });
const opt = (v: string) => (v.trim() ? v.trim() : undefined);

/** "Check the details": the read's fields, prefilled and editable. Typed purchases use it too (D30). */
export function DetailsForm({ initial, missing = [], single, submitLabel, onSubmit }: {
  initial?: Partial<PurchaseDetails>; missing?: DetailField[]; single?: boolean; submitLabel: string; onSubmit: (d: PurchaseDetails) => Promise<void> | void;
}) {
  const [merchant, setMerchant] = useState(initial?.merchant ?? "");
  const [date, setDate] = useState(initial?.date ?? "");
  const [currency, setCurrency] = useState(initial?.currency || "INR");
  const [total, setTotal] = useState(initial?.total ?? "");
  const [items, setItems] = useState<ItemDraft[]>(initial?.items?.length ? initial.items.map(toDraft) : [toDraft()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const miss = (f: DetailField) => missing.includes(f);
  const totalOk = money.test(total) && Number(total) > 0;
  const named = items.filter(i => i.name.trim());
  const valid = totalOk && /^[A-Z]{3}$/.test(currency) && named.length > 0 && named.every(i => !i.lineTotal || money.test(i.lineTotal));
  const setItem = (n: number, k: keyof ItemDraft, v: string) => setItems(xs => xs.map((x, i) => (i === n ? { ...x, [k]: v } : x)));
  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr(null);
    try {
      await onSubmit({
        merchant: opt(merchant), date: opt(date), currency, total,
        items: named.map(i => ({ name: i.name.trim(), brand: opt(i.brand), model: opt(i.model), category: opt(i.category), qty: Math.max(1, parseInt(i.qty, 10) || 1), lineTotal: opt(i.lineTotal) })),
      });
    } catch (e) { setErr(errorCopy(e instanceof ApiError ? e.code : undefined)); setBusy(false); }
  };
  const hint = (f: DetailField) => miss(f) ? <em className="missing-hint">We couldn't read this</em> : null;
  return <form className="card form details-form" onSubmit={e => { e.preventDefault(); void submit(); }}>
    {items.map((it, n) => <fieldset key={n} className={`item-fields ${miss("items") && !it.name ? "missing" : ""}`}>
      <label className={`field ${miss("items") && !it.name ? "missing" : ""}`}><span>{single ? "What did you buy?" : `Item ${n + 1}`} {n === 0 && hint("items")}</span>
        <input value={it.name} onChange={e => setItem(n, "name", e.target.value)} placeholder="iPhone 17 Pro" aria-invalid={miss("items") && !it.name} autoFocus={n === 0 && !it.name} /></label>
      <div className="field-row">
        <label className="field grow"><span>Brand <em>(optional)</em></span><input value={it.brand} onChange={e => setItem(n, "brand", e.target.value)} placeholder="Apple" /></label>
        <label className="field grow"><span>Model <em>(optional)</em></span><input value={it.model} onChange={e => setItem(n, "model", e.target.value)} placeholder="256 GB" /></label>
      </div>
      {!single && <div className="field-row">
        <label className="field"><span>Qty</span><input value={it.qty} onChange={e => setItem(n, "qty", e.target.value.replace(/\D/g, ""))} inputMode="numeric" /></label>
        <label className="field grow"><span>Line total <em>(optional)</em></span><input value={it.lineTotal} onChange={e => setItem(n, "lineTotal", e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" /></label>
        {items.length > 1 && <button type="button" className="button quiet icon-only" aria-label={`Remove item ${n + 1}`} onClick={() => setItems(xs => xs.filter((_, i) => i !== n))}><Trash2 size={16} /></button>}
      </div>}
    </fieldset>)}
    {!single && items.length < 30 && <button type="button" className="button quiet" onClick={() => setItems(xs => [...xs, toDraft()])}><Plus size={16} /> Add an item</button>}
    <div className="field-row">
      <label className={`field grow ${miss("total") ? "missing" : ""}`}><span>Amount paid {hint("total")}</span><input value={total} onChange={e => setTotal(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="79900" aria-invalid={miss("total")} /></label>
      <label className={`field ${miss("currency") ? "missing" : ""}`}><span>Currency {hint("currency")}</span><select value={currency} onChange={e => setCurrency(e.target.value)} aria-invalid={miss("currency")}>{[...new Set([currency, ...CURRENCIES])].map(c => <option key={c}>{c}</option>)}</select></label>
    </div>
    {total && !totalOk && <p className="error left">Enter an amount above $0.</p>}
    <div className="field-row">
      <label className={`field grow ${miss("merchant") ? "missing" : ""}`}><span>Shop <em>(optional)</em> {hint("merchant")}</span><input value={merchant} onChange={e => setMerchant(e.target.value)} placeholder="Croma" /></label>
      <label className={`field ${miss("date") ? "missing" : ""}`}><span>Date <em>(optional)</em></span><input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)} /></label>
    </div>
    {err && <p className="error" role="alert">{err}</p>}
    <button className="button primary full lg" disabled={!valid || busy}>{busy ? "Saving…" : submitLabel} {!busy && <ArrowRight size={18} />}</button>
  </form>;
}

export function TypeIt() {
  const { navigate } = useApp();
  return <div className="page flow narrow">
    <FlowHead title="Type it" back="/add" />
    <DetailsForm single submitLabel="Find the companies" onSubmit={d => {
      const i = d.items[0]!;
      startRead({ kind: "typed", text: { product: i.name, amount: d.total, currency: d.currency, ...(i.brand ? { maker: i.brand } : {}), ...(i.model ? { model: i.model } : {}), ...(d.merchant ? { shop: d.merchant } : {}), ...(d.date ? { date: d.date } : {}) } }, navigate);
    }} />
  </div>;
}

/** The read that needs a human: prefilled form, missing fields highlighted. Saving re-runs the jury. */
function CheckDetails({ p, onCancel }: { p: Purchase; onCancel?: () => void }) {
  const { navigate } = useApp();
  const d = p.details;
  return <div className="page flow narrow">
    <FlowHead title="Check the details" back="/add" />
    <p className="lede">{p.status === "needs_details" ? "We couldn't read everything. Fix or fill in what's highlighted, then we'll find the companies." : "Change anything that's wrong. We'll look for the companies again."}</p>
    <DetailsForm initial={d} missing={p.status === "needs_details" ? d?.missing : []} submitLabel="Find the companies" onSubmit={async v => {
      await api.saveDetails(p.id, v);
      startRead({ kind: "resume", id: p.id }, navigate);
    }} />
    {onCancel && <button className="button quiet full" onClick={onCancel}><X size={16} /> Keep the current match</button>}
  </div>;
}

const placeholderSteps: ReadStep[] = ["Read the receipt", "Convert to dollars", "Understand the product", "Ask 3 private AI jurors", "Merge their answers", "Check which ones you can buy"]
  .map((label, i) => ({ key: "read", label, state: i === 0 ? "running" : "todo" }));
const READ_LIMIT_MS = 330_000; // server reaper fails a read after 5 min

export function Reading() {
  const { navigate } = useApp();
  const [steps, setSteps] = useState<ReadStep[]>(placeholderSteps);
  const [error, setError] = useState<ApiError | null>(null);
  const [req, setReq] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; started.current = true;
    const p = takePending();
    if (!p) { navigate("/add", { dir: "back" }); return; }
    let alive = true;
    (async () => {
      try {
        // D30: the POST answers at once; the steps below are the server's real progress.
        const purchaseId = p.kind === "resume" ? p.id : (p.kind === "typed" ? await api.createPurchaseTyped(p.text) : await api.createPurchaseMedia(p.kind === "image" ? "image" : "audio", p.file, p.name)).purchaseId;
        const t0 = Date.now();
        let pur: Purchase = await api.purchase(purchaseId);
        let done = 0;
        while (alive && pur.status === "reading" && Date.now() - t0 < READ_LIMIT_MS) {
          if (pur.steps?.length) {
            const n = pur.steps.filter(s => s.state === "done").length;
            if (n > done) { haptic(4); done = n; }
            setSteps(pur.steps);
          }
          await new Promise(r => setTimeout(r, 700));
          pur = await api.purchase(purchaseId);
        }
        if (!alive) return;
        if (pur.steps?.length) setSteps(pur.steps);
        setReq(pur.ogRequestIds[0] ?? null);
        refreshAll();
        if (pur.status === "reading") { setLastRead(p, "timeout"); navigate("/add/error"); return; }
        if (pur.status === "read_failed") { setLastRead(p, pur.readError); setTimeout(() => navigate("/add/error"), 300); return; }
        setTimeout(() => navigate(`/add/${purchaseId}`), 450);
      } catch (e) { setError(e instanceof ApiError ? e : new ApiError("UPSTREAM", 0)); }
    })();
    return () => { alive = false; };
  }, [navigate]);
  return <div className="page flow narrow">
    <FlowHead title="Reading your receipt" back="/add" />
    <div className="scan"><Creative name="receipt" className="scan-img" priority /><span className="scan-line" aria-hidden="true" /></div>
    <h2 className="h-title center">Finding what's inside</h2>
    <p className="sub center">Three private AI models on 0G look at it. Usually under a minute.</p>
    <ErrorState error={error} onRetry={() => navigate("/add", { dir: "back" })} />
    <ol className="steps" aria-live="polite">
      {steps.map((s, i) => <li key={`${s.key}-${i}`} className={s.state === "done" ? "done" : s.state === "running" ? "now" : s.state === "failed" ? "failed" : ""}>
        <span className="step-dot">{s.state === "done" ? <Check size={14} strokeWidth={2.6} /> : s.state === "running" ? <Sparkles size={13} className="spin" /> : s.state === "failed" ? <X size={13} /> : null}</span>
        <span>{s.label}</span>
      </li>)}
    </ol>
    <p className="fineprint center">Read by a private AI model on 0G. The photo is deleted after reading.{req && <><br /><span className="mono">Request ID {req.slice(0, 4)}…{req.slice(-3)}</span></>}</p>
  </div>;
}

export function ReadError() {
  const { navigate } = useApp();
  const last = lastRead();
  const e = (last?.readError && readErrorText[last.readError]) || { text: readErrorCopy, retry: false };
  const canRetry = e.retry && last && last.input.kind !== "resume";
  return <div className="page flow narrow center">
    <FlowHead title="Couldn't read" back="/add" />
    <div className="scan dim"><Creative name="receipt" className="scan-img" /></div>
    <p className="lede">{e.text}</p>
    {!e.retry && <ul className="tips">{readTips.map(t => <li key={t}>{t}</li>)}</ul>}
    <div className="dock">
      {canRetry ? <button className="button primary full lg" onClick={() => startRead(last!.input, navigate)}>Try again</button>
        : <button className="button primary full lg" onClick={() => navigate("/add", { dir: "back" })}>Retake photo</button>}
      <button className="button quiet full" onClick={() => navigate("/add/type")}>Type it instead</button>
    </div>
  </div>;
}

const roleLabel: Record<string, string> = { maker: "Maker", supplier: "Behind it", material: "Material", fallback: "Fallback" };

/** D40 right column: the why for rows you can buy; everything not on-chain folds into one card. */
const WhyThese = memo(function WhyThese({ a, allocs }: { a: NonNullable<Purchase["analysis"]>; allocs: Allocation[] }) {
  const ids = new Set(allocs.map(x => x.assetId));
  const rows: (JuryRow & { group: string })[] = [
    ...(a.parent ? [{ ...a.parent, group: "Parent company" }] : []),
    ...a.enablers.map(r => ({ ...r, group: "Helps build it" })),
    ...a.commodities.map(r => ({ ...r, group: "Commodity" })),
  ];
  const on = rows.filter(r => r.status === "buyable" && r.assetId && ids.has(r.assetId));
  const off = rows.filter(r => !on.includes(r));
  const icon = (r: JuryRow) => allocs.find(x => x.assetId === r.assetId)?.icon;
  return <>
    {!!on.length && <section className="jury-section"><h3 className="micro">Why these</h3><div className="card list">{on.map((r, i) =>
      <div key={`${r.name}-${i}`} className="row jury-row">
        <Monogram name={r.name} icon={icon(r)} tone={toneFor(r.assetId ?? r.name)} size={38} />
        <span className="row-main">
          <span className="row-title clip">{r.name}{r.symbol && <span className="ticker"> {r.symbol}</span>}</span>
          <span className="jury-why">{r.why}</span>
          <span className="jury-meta"><span className="jury-badge on">{r.group}</span><span className="agree" title="AI jurors that named it">{r.agree}/{r.of} agree</span></span>
        </span>
      </div>)}</div></section>}
    {!!off.length && <section className="jury-section">
      <div className="off-head"><h3 className="micro">Also behind it · not on-chain yet</h3><span className="sub">Tap to read why</span></div>
      <div className="card list off-list">{off.map((r, i) =>
        <details key={`${r.name}-${i}`} className="off-row">
          <summary>
            <Monogram name={r.name} tone={toneFor(r.ticker ?? r.name)} size={32} />
            <span className="row-main">
              <span className="row-title clip">{r.name}{r.ticker && <span className="ticker"> {r.ticker}</span>}</span>
              <span className="off-why">{r.why}</span>
            </span>
            <span className="off-tag">{r.group}</span>
            <ChevronDown size={16} className="off-chev" aria-hidden="true" />
          </summary>
          <div className="off-more">
            <p>{r.why}</p>
            <span className="jury-meta"><span className="jury-badge">{r.status === "private" ? "Private company" : r.status === "tokenized_unverified" ? "Token not verified yet" : "Not on-chain yet"}</span><span className="agree" title="AI jurors that named it">{r.agree}/{r.of} agree</span></span>
          </div>
        </details>)}
      </div>
    </section>}
  </>;
});

type Mix = "suggested" | "even" | "maker";
/** "$50" for whole dollars, "$8.04" otherwise: chips read faster without ".00". */
const short$ = (c: bigint) => fmtUsd(c).replace(/\.00$/, "");

export function Confirm({ id }: { id: string }) {
  const { navigate } = useApp();
  const p = useApi(`purchase:${id}`, () => api.purchase(id));
  const home = useApi("home", api.home);
  const [why, setWhy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const data = p.data;
  // Opened while the read still runs (reload, deep link): go back to the live steps.
  useEffect(() => { if (data?.status === "reading") startRead({ kind: "resume", id }, navigate); }, [data?.status, id, navigate]);

  // Keyed on content, not identity: the cached paint and its background refetch must not wipe your edits.
  const sig = (data?.allocations ?? []).map(a => `${a.assetId}:${a.amountUsd6}:${a.selected}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allocs = useMemo(() => data?.allocations ?? [], [sig]);
  const ids = useMemo(() => allocs.map(a => a.assetId), [allocs]);
  // The jury's split, in cents, is the "Suggested" mix; rows you'd unticked earlier start at $0.
  const suggested = useMemo(() => Object.fromEntries(allocs.map(a => [a.assetId, a.selected ? centsOf(a.amountUsd6) : 0n])) as Cents, [allocs]);
  const suggestedTotal = sumOf(suggested);
  const [amt, setAmt] = useState<Cents>({});
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [mix, setMix] = useState<Mix>("suggested");
  const [chip, setChip] = useState<string>("suggested");
  const [typing, setTyping] = useState<Record<string, string>>({});
  const inFlight = useRef(false);
  // Reset local amounts whenever the server's rows change (new jury run, edited details).
  useEffect(() => { setAmt(suggested); setLocked(new Set()); setMix("suggested"); setChip("suggested"); setTyping({}); }, [suggested]);

  const maker = allocs.find(a => a.role === "maker") ?? allocs.find(a => a.role === "fallback");
  const weights = (m: Mix): Cents => m === "even" ? Object.fromEntries(ids.map(x => [x, 1n]))
    : m === "maker" && maker ? Object.fromEntries(ids.map(x => [x, x === maker.assetId ? 1n : 0n])) : suggested;
  const total = sumOf(amt);
  const set = (next: Cents) => setAmt(next);
  const setTotal = (cents: bigint, keepLocks = true) => {
    const lk = keepLocks ? locked : new Set<string>();
    if (!keepLocks) setLocked(lk);
    set(spread(ids, weights(mix), cents, lk, amt));
  };
  const setRow = (assetId: string, cents: bigint) => {
    const lk = new Set(locked).add(assetId);
    setLocked(lk); setChip("");
    setAmt({ ...amt, [assetId]: cents });
  };
  const pickMix = (m: Mix) => { haptic(5); setMix(m); setLocked(new Set()); set(spread(ids, weights(m), total, new Set(), amt)); };

  const confirm = async () => {
    if (inFlight.current) return; // a double tap must not send a second save
    inFlight.current = true; setBusy(true); setErr(null);
    try {
      // Rows you'd unticked before are back in play: $0 now means "not this time" (D40).
      if (allocs.some(a => !a.selected)) await api.deselect(id, []);
      const amounts = ids.map(x => ({ assetId: x, amountUsd6: ((amt[x] ?? 0n) * 10_000n).toString() }));
      const { action } = await api.confirm(id, amounts);
      const signed = await signAction(action);
      await api.confirmSubmitted(id, signed.txHash);
      refreshAll(); navigate(`/add/${id}/saved`);
    } catch (e) {
      // A step can fail after the save already landed (slow proxy, a retried tap, a stale API).
      // The server is the truth: if it says saved, it's saved, and there's nothing to show as an error.
      const now = await api.purchase(id).catch(() => null);
      if (now?.status === "saved") { refreshAll(); navigate(`/add/${id}/saved`); return; }
      setErr(errorCopy(e instanceof ApiError ? e.code : undefined));
      setBusy(false); inFlight.current = false;
    }
  };
  if (p.error) return <div className="page flow"><FlowHead title="Confirm purchase" back="/add" /><ErrorState error={p.error} onRetry={p.reload} /></div>;
  if (!data) return <div className="page flow"><FlowHead title="Confirm purchase" back="/add" /><Skeleton h={110} /><Skeleton h={260} mt={18} /></div>;

  if (data.status === "needs_details" || editing) return <CheckDetails p={data} onCancel={editing ? () => setEditing(false) : undefined} />;

  const r = data.receipt;
  const spent = r ? centsOf(r.amountUsd6) : 0n;
  // Wallet USDC not already promised to other jars.
  const freeCents = home.data ? (w => (w > 0n ? w : 0n))(centsOf(home.data.balance.usdc.freeUsd6) - centsOf(home.data.balance.usdc.inJarsUsd6)) : null;
  const done = data.status === "saved" || data.status === "confirming";
  const kept = ids.filter(x => (amt[x] ?? 0n) > 0n).length;
  const lockedSum = ids.reduce((s, x) => s + (locked.has(x) ? amt[x] ?? 0n : 0n), 0n);
  const maxOf = (...xs: bigint[]) => xs.reduce((m, x) => (x > m ? x : m), 0n);
  // A sane range for one jar; the total's range starts at what's locked and always leaves room above it.
  const rowMax = maxOf(spent / 10n, suggestedTotal * 2n, 500n);
  const sliderMax = maxOf(rowMax, total, lockedSum + rowMax);
  const step = stepFor(sliderMax - lockedSum);
  const rowStep = stepFor(rowMax);
  const fill = (v: bigint, lo: bigint, hi: bigint) => `${hi > lo ? Number(((v - lo) * 1000n) / (hi - lo)) / 10 : 0}%`;
  const chips: [string, string, bigint][] = [
    ...(spent ? [["1", "1%", spent / 100n], ["2", "2%", spent / 50n]] as [string, string, bigint][] : []),
    ["suggested", "Suggested", suggestedTotal],
    ...(roundNice(suggestedTotal) !== suggestedTotal ? [["round", `Round ${short$(roundNice(suggestedTotal))}`, roundNice(suggestedTotal)]] as [string, string, bigint][] : []),
    ...(freeCents && freeCents > 0n && freeCents !== suggestedTotal ? [["free", `Free ${short$(freeCents)}`, freeCents]] as [string, string, bigint][] : []),
  ];
  const short = freeCents != null && total > freeCents ? total - freeCents : 0n;

  return <div className="page flow wide">
    <FlowHead title={data.status === "not_listed" ? "Brand not listed" : "Confirm purchase"} back="/add" />
    <div className="two-col confirm-cols">
      <div className="confirm-main">
        <section className="card product">
          <div className="product-art" aria-hidden="true"><span /></div>
          <div className="row-main"><p className="micro clip">{[r?.shop, r?.date ? new Date(r.date).toLocaleDateString([], { day: "numeric", month: "short" }) : ""].filter(Boolean).join(" · ")}</p><h2 className="h-card big clip2">{r?.items[0] ?? "Purchase"}</h2>{r && <p className="sub clip">{fmtLocal(r.local.amount, r.local.currency)}{r.local.currency !== "USD" ? ` → ${fmtUsd6(r.amountUsd6)}` : ""}</p>}</div>
        </section>

        {data.status === "not_listed" && <div className="insight"><span>This brand has no shares to buy yet, so your {(data.rateBps ?? 500) / 100}% ({fmtUsd6(data.investUsd6)}) can go to your fallback instead.</span></div>}
        {data.status === "needs_review" && <div className="insight"><span>We're not sure about one of these companies. Check the match before you confirm.</span></div>}

        {!!ids.length && <section className="card amount-card" aria-label="How much to set aside">
          <div className="amount-head">
            <p className="micro">Set aside</p>
            {spent > 0n && <span className="sub num">{pct1(total, spent)} of it</span>}
          </div>
          <Money cents={total} className="amount-total" />
          <input type="range" className="range" aria-label="Total to set aside" disabled={done}
            min={Number(lockedSum)} max={Number(sliderMax)} step={Number(step)} value={Number(total)}
            style={{ "--p": fill(total, lockedSum, sliderMax) } as CSSProperties}
            onChange={e => { setChip(""); setTotal(BigInt(e.target.value)); }} />
          <div className="chip-row" role="group" aria-label="Quick amounts">
            {chips.map(([k, label, v]) => <button key={k} type="button" className={`chip sm ${chip === k ? "on" : ""}`} disabled={done} onClick={() => { haptic(5); setChip(k); setTotal(v, false); }}>{label}</button>)}
          </div>
        </section>}

        {!!ids.length && <section className="card jars-card" aria-label="Your jars">
          <div className="jars-card-head">
            <h2 className="h-card">Your jars</h2>
            {ids.length > 1 && <div className="seg" role="group" aria-label="Mix">
              {(["suggested", "even", ...(maker ? ["maker"] : [])] as Mix[]).map(m => <button key={m} type="button" className={mix === m && !locked.size ? "on" : ""} disabled={done} onClick={() => pickMix(m)}>{m === "suggested" ? "Suggested" : m === "even" ? "Even" : "Maker only"}</button>)}
            </div>}
          </div>
          <div className="splitbar" role="img" aria-label={ids.map(x => `${assetName(x, allocs.find(a => a.assetId === x)?.name)} ${fmtUsd(amt[x] ?? 0n)}`).join(", ")}>
            {allocs.map(a => <span key={a.assetId} className={`tone-bg-${toneFor(a.assetId)}`} style={{ flexGrow: Number(amt[a.assetId] ?? 0n), opacity: (amt[a.assetId] ?? 0n) > 0n ? 1 : 0 }} />)}
          </div>
          <div className="amt-rows">
            {allocs.map(a => {
              const name = assetName(a.assetId, a.name); const v = amt[a.assetId] ?? 0n; const lk = locked.has(a.assetId);
              const shown = typing[a.assetId] ?? `${v / 100n}.${(v % 100n).toString().padStart(2, "0")}`;
              return <div key={a.assetId} className={`amt-row ${v === 0n ? "zero" : ""}`}>
                <Monogram name={name} icon={a.icon} tone={toneFor(a.assetId)} size={36} />
                <div className="amt-main">
                  <span className="amt-name"><span className="clip">{name}</span><span className="role-dot">{roleLabel[a.role] ?? a.role}</span></span>
                  <input type="range" className="range thin" aria-label={`${name} amount`} disabled={done}
                    min={0} max={Number(maxOf(rowMax, v))} step={Number(rowStep)} value={Number(v)}
                    style={{ "--p": fill(v, 0n, maxOf(rowMax, v)) } as CSSProperties}
                    onChange={e => setRow(a.assetId, BigInt(e.target.value))} />
                </div>
                <label className="amt-input">
                  <span aria-hidden="true">$</span>
                  <input inputMode="decimal" aria-label={`${name} dollars`} disabled={done}
                    value={shown} style={{ width: `${Math.max(4, shown.length) + .5}ch` }}
                    onFocus={e => e.currentTarget.select()}
                    onChange={e => { const raw = e.target.value; setTyping(t => ({ ...t, [a.assetId]: raw })); const c = parseDollars(raw); if (c != null) setRow(a.assetId, c); }}
                    onBlur={() => setTyping(t => { const n = { ...t }; delete n[a.assetId]; return n; })}
                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                </label>
                <button type="button" className={`lock ${lk ? "on" : ""}`} disabled={done} aria-pressed={lk} aria-label={lk ? `Unlock ${name}` : `Lock ${name}`}
                  onClick={() => { const n = new Set(locked); if (lk) n.delete(a.assetId); else n.add(a.assetId); setLocked(n); }}>
                  {lk ? <Lock size={16} /> : <LockOpen size={16} />}
                </button>
              </div>;
            })}
          </div>
          <p className="amt-hint"><Lock size={13} /> Typed amounts lock. The total moves the rest.</p>
        </section>}

        {!!ids.length && !done && freeCents != null && <div className="free-line">
          <div className="free-meter" aria-hidden="true"><span style={{ transform: `scaleX(${total > 0n ? Math.min(1, Number((freeCents * 1000n) / total) / 1000) : 1})` }} /></div>
          <p className="sub">{short === 0n ? "You can buy all of this today." : `${fmtUsd(freeCents)} is ready to buy. Add ${fmtUsd(short)} when you want the rest.`}</p>
        </div>}

        <p className="fee"><ShieldCheck size={15} /> Network fee $0.00 · we cover it</p>
        {err && <p className="error" role="alert">{err}</p>}
        {done ? <div className="dock"><button className="button primary full lg" onClick={() => navigate("/jars")}>View your jars</button></div>
          : <div className="dock">
              {busy ? <button className="button primary full lg" disabled>Saving… usually 2 s</button>
                : kept ? <ConfirmAction label={`Put ${fmtUsd(total)} in ${kept} jar${kept === 1 ? "" : "s"}`} onConfirm={confirm} />
                : ids.length ? <button className="button primary full lg" disabled>Set an amount first</button> : null}
              {data.status === "not_listed" && <div className="dock-row"><button className="button quiet" onClick={async () => { await api.fallback(id, "skip").catch(() => {}); refreshAll(); navigate("/", { dir: "back" }); }}>Skip this purchase</button></div>}
            </div>}
      </div>

      <div className="confirm-side">
        {data.analysis ? <WhyThese a={data.analysis} allocs={allocs} /> : <section className="jury-section"><h3 className="micro">Why these</h3><div className="card list">
          {allocs.map(a => <div key={a.assetId} className="row jury-row">
            <Monogram name={assetName(a.assetId, a.name)} icon={a.icon} tone={toneFor(a.assetId)} size={38} />
            <span className="row-main"><span className="row-title clip">{assetName(a.assetId, a.name)}</span>{a.why && <span className="jury-why">{a.why}</span>}<span className="jury-meta"><span className="jury-badge on">{roleLabel[a.role] ?? a.role}</span></span></span>
          </div>)}
        </div></section>}
        <button className="disclose" aria-expanded={why} onClick={() => setWhy(!why)}>How we chose these <ChevronDown size={16} /></button>
        {why && <div className="why">
          {data.analysis ? <p>{data.analysis.cached ? "Answered earlier by the jury for this product: " : "Three private AI jurors on 0G answered on their own, then a judge merged them: "}{data.analysis.jurors.map(j => `${j.model}${j.ok ? "" : " (no answer)"}`).join(", ") || "seed list"}. Code checked every name against the token registry; only verified tokens with a live Jupiter route can be bought.</p>
            : <p>Matched from the company registry. Only verified tokens with a live Jupiter route can be bought.</p>}
          {!!data.ogRequestIds.length && <p className="mono">AI request ID: {data.ogRequestIds.map(x => `${x.slice(0, 4)}…${x.slice(-3)}`).join(", ")}</p>}
          {!data.ogRequestIds.length && data.source === "typed" && <p className="sub">Typed entry — matched from the company registry (no receipt AI read).</p>}
        </div>}
        {!done && data.details && <button className="button quiet full" onClick={() => setEditing(true)}>Wrong details? Edit them</button>}
      </div>
    </div>
  </div>;
}

export function Saved({ id }: { id: string }) {
  const { navigate } = useApp();
  const p = useApi(`purchase:${id}`, () => api.purchase(id));
  useEffect(() => { haptic([10, 50, 14]); }, []);
  const sel = p.data?.allocations.filter(a => a.selected && BigInt(a.amountUsd6) > 0n) ?? [];
  const maker = sel.find(a => a.role === "maker") ?? sel[0];
  return <div className="page flow narrow center celebrate">
    <div className="celebrate-stage" aria-hidden="true">
      <span className="falling f1" /><span className="falling f2" /><span className="falling f3" />
      <GlassJar pct={100} ready size={120} icon={maker?.icon} name={maker ? assetName(maker.assetId, maker.name) : undefined} tone={maker ? toneFor(maker.assetId) : undefined} />
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
