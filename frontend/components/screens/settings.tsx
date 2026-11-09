"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Copy, Monitor, Moon, Plus, Sun, UserRound, WalletCards } from "lucide-react";
import QRCode from "qrcode";
import { useApp } from "../app-context";
import { useSession } from "../session-context";
import { Monogram, Sheet, haptic } from "../ui";
import { ErrorState, Skeleton, SkeletonList } from "../states";
import { api, ApiError } from "../../lib/api";
import { useApi, refreshAll } from "../../lib/use-api";
import { errorCopy } from "../../lib/copy";
import { assetName } from "../../lib/assets";
import { fmtUsd6 } from "../../lib/money";
import { FlowHead } from "./home";

function Row({ title, value, icon, onClick }: { title: string; value?: string; icon?: React.ReactNode; onClick?: () => void }) {
  return <button className="row" onClick={onClick} disabled={!onClick}>
    {icon && <span className="mini-icon sm">{icon}</span>}
    <span className="row-main row-title">{title}</span>
    {value && <span className="row-value soft">{value}</span>}
    {onClick && <ChevronRight size={16} className="row-chev" />}
  </button>;
}

type Theme = "system" | "light" | "dark";
type SheetKind = "rate" | "limit" | "fees" | "ready" | "fallback" | null;

const FALLBACKS = [
  ["idx:sp500", "S&P 500"],
  ["idx:nasdaq100", "Nasdaq 100"],
  ["mat:gold", "Gold"],
  ["crypto:btc", "Bitcoin"],
  ["crypto:eth", "Ethereum"],
  ["idx:tbills", "T-bills"],
] as const;

export function Settings() {
  const { navigate, notify } = useApp();
  const { me, signOut, refresh } = useSession();
  const rules = useApi("rules", api.rules);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [rate, setRate] = useState(5);
  const [limit, setLimit] = useState(50);
  const [fees, setFees] = useState(5);
  const [ready, setReady] = useState(5);
  const [fallback, setFallback] = useState("idx:sp500");
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => { try { const t = localStorage.getItem("ob-theme"); if (t === "light" || t === "dark") setTheme(t); } catch { /* ignore */ } }, []);
  useEffect(() => {
    if (!rules.data) return;
    setRate(rules.data.rateBps / 100);
    setLimit(Number(BigInt(rules.data.monthlyCapUsd6) / 1_000_000n) || 50);
    setFees(rules.data.maxFeeBps / 100);
    setReady(Number(BigInt(rules.data.readyMinUsd6) / 1_000_000n) || 5);
    setFallback(rules.data.fallbackAsset);
  }, [rules.data]);
  const pickTheme = (t: Theme) => {
    setTheme(t); haptic(5);
    if (t === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    try { if (t === "system") localStorage.removeItem("ob-theme"); else localStorage.setItem("ob-theme", t); } catch { /* ignore */ }
  };
  const save = async (patch: Parameters<typeof api.putRules>[0]) => {
    try { await api.putRules(patch); setSheet(null); rules.reload(); await refresh(); notify("Saved"); }
    catch (e) { notify(errorCopy(e instanceof ApiError ? e.code : undefined)); }
  };
  const download = async () => {
    try {
      const data = await api.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = "ownback-export.json"; a.click(); URL.revokeObjectURL(url);
    } catch (e) { notify(errorCopy(e instanceof ApiError ? e.code : undefined)); }
  };
  const r = rules.data;
  return <div className="page">
    <header className="page-head"><div><p className="kicker">Your rules, your data</p><h1 className="h-page">Settings</h1></div></header>

    <section className="card profile">
      <Monogram tone="green" size={52}><UserRound size={24} /></Monogram>
      <div className="row-main"><strong className="h-card">{me?.displayName ?? "You"}</strong><span className="row-sub">{me?.email ?? (me?.authKind === "seed" ? "Seed phrase" : "Google")}</span></div>
      <button className="button secondary sm" onClick={() => navigate("/funds")}><Plus size={15} /> Add funds</button>
    </section>

    <ErrorState error={rules.error} onRetry={rules.reload} />
    <div className="settings-grid">
      <section className="block"><p className="micro">Investing</p>
        {!r ? <SkeletonList rows={5} /> : <div className="card list">
          <Row title="Purchase rate" value={`${r.rateBps / 100}%`} onClick={() => setSheet("rate")} />
          <Row title="Monthly limit" value={fmtUsd6(r.monthlyCapUsd6)} onClick={() => setSheet("limit")} />
          <Row title="Max fees" value={`${r.maxFeeBps / 100}% of each buy`} onClick={() => setSheet("fees")} />
          <Row title="Ready when" value={fmtUsd6(r.readyMinUsd6)} onClick={() => setSheet("ready")} />
          <Row title="Fallback" value={assetName(r.fallbackAsset)} onClick={() => setSheet("fallback")} />
        </div>}
      </section>
      <section className="block"><p className="micro">Money & access</p>
        <div className="card list">
          <Row title="Wallets and sign-in" value={me?.evmAddress ? `${me.evmAddress.slice(0, 6)}…${me.evmAddress.slice(-4)}` : undefined} icon={<WalletCards size={17} />} />
          <Row title="Add funds" icon={<Plus size={17} />} onClick={() => navigate("/funds")} />
        </div>
      </section>
      <section className="block"><p className="micro">Appearance</p>
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {([["system", "System", Monitor], ["light", "Light", Sun], ["dark", "Dark", Moon]] as const).map(([k, label, I]) =>
            <button key={k} role="radio" aria-checked={theme === k} className={theme === k ? "on" : ""} onClick={() => pickTheme(k)}><I size={16} /> {label}</button>)}
        </div>
      </section>
      <section className="block"><p className="micro">Privacy & help</p>
        <div className="card list">
          <Row title="How Ownback works" onClick={() => window.open("/how-it-works", "_blank")} />
          <Row title="Risks" onClick={() => window.open("/risks", "_blank")} />
          <Row title="Download my data" onClick={download} />
        </div>
      </section>
    </div>
    <button className="button quiet full" style={{ marginTop: 28 }} onClick={async () => { await signOut(); navigate("/signin"); }}>Sign out</button>
    <p className="fineprint center">Ownback v0.1 · Built with proof, not promises.</p>

    <Sheet open={sheet === "rate"} onClose={() => setSheet(null)} title="Purchase rate">
      <div className="big-value"><span className="num">{rate}%</span><span className="sub">of each purchase</span></div>
      <input className="range" type="range" min={2} max={10} value={rate} onChange={e => { setRate(Number(e.target.value)); haptic(3); }} aria-label="Purchase rate" style={{ "--p": `${((rate - 2) / 8) * 100}%` } as React.CSSProperties} />
      <div className="range-ends"><span>2%</span><span>10%</span></div>
      <button className="button primary full" onClick={() => save({ rateBps: rate * 100 })}>Save</button>
    </Sheet>
    <Sheet open={sheet === "limit"} onClose={() => setSheet(null)} title="Monthly limit">
      <div className="big-value"><span className="num">${limit}</span><span className="sub">per month</span></div>
      <input className="range" type="range" min={10} max={200} step={10} value={limit} onChange={e => { setLimit(Number(e.target.value)); haptic(3); }} aria-label="Monthly limit" style={{ "--p": `${((limit - 10) / 190) * 100}%` } as React.CSSProperties} />
      <div className="range-ends"><span>$10</span><span>$200</span></div>
      <button className="button primary full" onClick={() => save({ monthlyCapUsd6: (BigInt(limit) * 1_000_000n).toString() })}>Save</button>
    </Sheet>
    <Sheet open={sheet === "fees"} onClose={() => setSheet(null)} title="Max fees">
      <div className="big-value"><span className="num">{fees}%</span><span className="sub">of each buy</span></div>
      <input className="range" type="range" min={0.5} max={10} step={0.5} value={fees} onChange={e => { setFees(Number(e.target.value)); haptic(3); }} aria-label="Max fees" style={{ "--p": `${((fees - 0.5) / 9.5) * 100}%` } as React.CSSProperties} />
      <div className="range-ends"><span>0.5%</span><span>10%</span></div>
      <button className="button primary full" onClick={() => save({ maxFeeBps: Math.round(fees * 100) })}>Save</button>
    </Sheet>
    <Sheet open={sheet === "ready"} onClose={() => setSheet(null)} title="Ready when">
      <div className="big-value"><span className="num">${ready}</span><span className="sub">jar reminder</span></div>
      <input className="range" type="range" min={1} max={50} value={ready} onChange={e => { setReady(Number(e.target.value)); haptic(3); }} aria-label="Ready minimum" style={{ "--p": `${((ready - 1) / 49) * 100}%` } as React.CSSProperties} />
      <div className="range-ends"><span>$1</span><span>$50</span></div>
      <button className="button primary full" onClick={() => save({ readyMinUsd6: (BigInt(ready) * 1_000_000n).toString() })}>Save</button>
    </Sheet>
    <Sheet open={sheet === "fallback"} onClose={() => setSheet(null)} title="Fallback">
      <div className="card list">
        {FALLBACKS.map(([id, label]) =>
          <button key={id} className={`row ${fallback === id ? "on" : ""}`} onClick={() => { setFallback(id); haptic(3); }}>
            <span className="row-main row-title">{label}</span>
            {fallback === id && <span className="row-value soft">Selected</span>}
          </button>)}
      </div>
      <button className="button primary full" style={{ marginTop: 16 }} onClick={() => save({ fallbackAsset: fallback })}>Save</button>
    </Sheet>
  </div>;
}

const chains = [["arc", "Arc"], ["solana", "Solana"], ["base", "Base"], ["ethereum", "Ethereum"], ["arbitrum", "Arbitrum"]] as const;

function Qr({ value }: { value: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => { QRCode.toString(value, { type: "svg", margin: 1, color: { dark: "#0E2A1F", light: "#FFFFFF" } }).then(setSvg, () => setSvg("")); }, [value]);
  // The SVG comes from the qrcode library from our own address string, never from user HTML.
  return <div className="qr" role="img" aria-label="QR code for your address" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function Funds() {
  const { navigate, notify } = useApp();
  const [chain, setChain] = useState<(typeof chains)[number][0]>("arc");
  const addr = useApi(`deposit:${chain}`, () => api.depositAddress(chain));
  // Only deposits that land while this screen is open (2 min grace for a send made just before opening it).
  const [since] = useState(() => new Date(Date.now() - 120_000).toISOString());
  const watch = useApi(`watch:${chain}:${since}`, () => api.depositWatch(chain, since), { pollMs: 5000 });
  const [ago, setAgo] = useState(0);
  const announced = useRef<string | null>(null);
  useEffect(() => { const t = setInterval(() => setAgo(watch.data ? Math.max(0, Math.round((Date.now() - new Date(watch.data.checkedAt).getTime()) / 1000)) : 0), 1000); return () => clearInterval(t); }, [watch.data]);
  useEffect(() => {
    const d = watch.data?.deposit;
    if (d?.status === "added" && announced.current !== d.id) { announced.current = d.id; haptic([10, 40, 10]); notify(`${fmtUsd6(d.amountUsd6)} added`); refreshAll(); }
  }, [watch.data?.deposit, notify]);
  const label = chains.find(c => c[0] === chain)![1];
  const copy = async () => {
    if (!addr.data?.address) return;
    try { await navigator.clipboard.writeText(addr.data.address); haptic(8); notify("Address copied"); } catch { notify("Couldn't copy"); }
  };
  return <div className="page flow narrow">
    <FlowHead title="Add funds" back="/" />
    <p className="lede left">Send USDC to your wallet. Arc is the default — money lands where your jars live.</p>
    <div className="segmented wrap" role="tablist">
      {chains.map(([k, name]) => <button key={k} role="tab" aria-selected={chain === k} className={chain === k ? "on" : ""} onClick={() => setChain(k)}>{name}</button>)}
    </div>
    <ErrorState error={addr.error} onRetry={addr.reload} />
    {addr.loading && <Skeleton h={220} mt={16} />}
    {addr.data && <section className="card deposit">
      <Qr value={addr.data.address} />
      <p className="mono center break">{addr.data.address}</p>
      <button className="button secondary full" onClick={copy}><Copy size={16} /> Copy {label} address</button>
      <p className="fineprint center">Min {fmtUsd6(addr.data.minUsd6)} · checked {ago}s ago</p>
      {watch.data?.deposit && <p className="sub center pos">{fmtUsd6(watch.data.deposit.amountUsd6)} {watch.data.deposit.status}</p>}
    </section>}
    <div className="dock">
      <button className="button quiet full" onClick={() => navigate("/")}>Skip for now</button>
    </div>
  </div>;
}
