"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Copy, Monitor, Moon, Plus, Sun, UserRound, WalletCards } from "lucide-react";
import QRCode from "qrcode";
import { useApp } from "../app-context";
import { useSession } from "../session";
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

export function Settings() {
  const { navigate, notify } = useApp();
  const { me, signOut } = useSession();
  const rules = useApi("rules", api.rules);
  const [rateOpen, setRateOpen] = useState(false);
  const [rate, setRate] = useState(5);
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => { try { const t = localStorage.getItem("ob-theme"); if (t === "light" || t === "dark") setTheme(t); } catch { /* ignore */ } }, []);
  useEffect(() => { if (rules.data) setRate(rules.data.rateBps / 100); }, [rules.data]);
  const pickTheme = (t: Theme) => {
    setTheme(t); haptic(5);
    if (t === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    try { if (t === "system") localStorage.removeItem("ob-theme"); else localStorage.setItem("ob-theme", t); } catch { /* ignore */ }
  };
  const saveRate = async () => {
    try { await api.putRules({ rateBps: rate * 100 }); setRateOpen(false); rules.reload(); notify("Saved"); }
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
          <Row title="Purchase rate" value={`${r.rateBps / 100}%`} onClick={() => setRateOpen(true)} />
          <Row title="Monthly limit" value={fmtUsd6(r.monthlyCapUsd6)} />
          <Row title="Max fees" value={`${r.maxFeeBps / 100}% of each buy`} />
          <Row title="Ready when" value={fmtUsd6(r.readyMinUsd6)} />
          <Row title="Fallback" value={assetName(r.fallbackAsset)} />
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

    <Sheet open={rateOpen} onClose={() => setRateOpen(false)} title="Purchase rate">
      <div className="big-value"><span className="num">{rate}%</span><span className="sub">of each purchase</span></div>
      <input className="range" type="range" min={2} max={10} value={rate} onChange={e => { setRate(Number(e.target.value)); haptic(3); }} aria-label="Purchase rate" style={{ "--p": `${((rate - 2) / 8) * 100}%` } as React.CSSProperties} />
      <div className="range-ends"><span>2%</span><span>10%</span></div>
      <button className="button primary full" onClick={saveRate}>Save</button>
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
  const sol = chain === "solana";
  const a = addr.data?.address;
  return <div className="page flow wide">
    <FlowHead title="Add funds" back="/settings" />
    <p className="lede left">Send USDC from any chain we support. It all lands in one dollar balance, and we move what's needed to your vault on Arc.</p>
    <div className="segmented" role="radiogroup" aria-label="Method">
      <button role="radio" aria-checked className="on">Send USDC</button>
      <button role="radio" aria-checked={false} disabled>Card or UPI · Coming soon</button>
    </div>
    <div className="chips h-scroll" style={{ marginTop: 16 }}>
      {chains.map(([k, l]) => <button key={k} className={`chip ${chain === k ? "on" : ""}`} onClick={() => { haptic(4); setChain(k); }}>{l}{k === "arc" && <span className="chip-note">default</span>}</button>)}
    </div>
    <ErrorState error={addr.error} onRetry={addr.reload} />
    <div className="two-col">
      <section className="card address">
        {a ? <Qr value={a} /> : <Skeleton h={188} r={18} />}
        <strong>Your USDC address on {label} · min {fmtUsd6(addr.data?.minUsd6 ?? "1000000")}</strong>
        <p className="mono addr">{a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "…"}</p>
        <button className="button secondary" disabled={!a} onClick={() => { if (a) navigator.clipboard?.writeText(a).then(() => { haptic(8); notify("Address copied"); }, () => {}); }}><Copy size={16} /> Copy address</button>
        <p className="sub">{sol ? "Solana has its own address." : "Same address on Arc, Base, Ethereum, Arbitrum"}</p>
      </section>
      <div>
        <button className="watching" onClick={() => watch.reload()}>
          <span className="pulse" aria-hidden="true" />
          <div><strong>{watch.data?.deposit ? `${fmtUsd6(watch.data.deposit.amountUsd6)} ${watch.data.deposit.status === "added" ? "added" : "on its way"}` :`Watching ${label} for your USDC… checked ${ago} s ago`}</strong><p className="sub">Checks every 5 s while this screen is open. Pull down or tap to check now.</p></div>
        </button>
        <div className="insight"><span>Only USDC, only on {label}.{!sol && " Solana has its own address."} Network fee $0.00 · we cover it.</span></div>
        <button className="button quiet full" style={{ marginTop: 16 }} onClick={() => navigate("/", { dir: "back" })}>Skip for now · we'll tell you when it lands</button>
      </div>
    </div>
  </div>;
}
