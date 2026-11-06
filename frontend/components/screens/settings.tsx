"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Copy, Monitor, Moon, Plus, Sun, UserRound, WalletCards } from "lucide-react";
import { useApp } from "../app-context";
import { Monogram, Sheet, haptic } from "../ui";
import { FlowHead } from "./home";

function Row({ title, value, icon, onClick }: { title: string; value?: string; icon?: React.ReactNode; onClick?: () => void }) {
  return <button className="row" onClick={onClick}>
    {icon && <span className="mini-icon sm">{icon}</span>}
    <span className="row-main row-title">{title}</span>
    {value && <span className="row-value soft">{value}</span>}
    <ChevronRight size={16} className="row-chev" />
  </button>;
}

function Toggle({ title, sub, value, onChange }: { title: string; sub?: string; value: boolean; onChange: () => void }) {
  return <div className="row">
    <span className="row-main"><span className="row-title">{title}</span>{sub && <span className="row-sub wrap">{sub}</span>}</span>
    <button className={`switch ${value ? "on" : ""}`} role="switch" aria-checked={value} aria-label={title} onClick={() => { haptic(6); onChange(); }}><span /></button>
  </div>;
}

type Theme = "system" | "light" | "dark";

export function Settings() {
  const { navigate, notify } = useApp();
  const [push, setPush] = useState(true);
  const [gmail, setGmail] = useState(false);
  const [rate, setRate] = useState(5);
  const [rateOpen, setRateOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => { try { const t = localStorage.getItem("ob-theme"); if (t === "light" || t === "dark") setTheme(t); } catch { /* ignore */ } }, []);
  const pickTheme = (t: Theme) => {
    setTheme(t); haptic(5);
    if (t === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    try { if (t === "system") localStorage.removeItem("ob-theme"); else localStorage.setItem("ob-theme", t); } catch { /* ignore */ }
  };
  return <div className="page">
    <header className="page-head"><div><p className="kicker">Your rules, your data</p><h1 className="h-page">Settings</h1></div></header>

    <section className="card profile">
      <Monogram tone="green" size={52}><UserRound size={24} /></Monogram>
      <div className="row-main"><strong className="h-card">Abhi</strong><span className="row-sub">Google · 2 wallets</span></div>
      <button className="button secondary sm" onClick={() => navigate("/funds")}><Plus size={15} /> Add funds</button>
    </section>

    <div className="settings-grid">
      <section className="block"><p className="micro">Investing</p>
        <div className="card list">
          <Row title="Purchase rate" value={`${rate}%`} onClick={() => setRateOpen(true)} />
          <Row title="Monthly limit" value="$50" />
          <Row title="Max fees" value="5% of each buy" />
          <Row title="Ready when" value="$5" />
          <Row title="Fallback" value="S&P 500" />
        </div>
      </section>
      <section className="block"><p className="micro">Money & access</p>
        <div className="card list">
          <Row title="Wallets and sign-in" value="2 wallets" icon={<WalletCards size={17} />} />
          <Row title="Add funds" icon={<Plus size={17} />} onClick={() => navigate("/funds")} />
        </div>
      </section>
      <section className="block"><p className="micro">Connections</p>
        <div className="card list">
          <Toggle title="Purchase reminders" sub="A nudge on Sunday when jars are ready" value={push} onChange={() => setPush(!push)} />
          <Toggle title="Gmail receipts" value={gmail} onChange={() => setGmail(!gmail)} />
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
          <Row title="How Ownback works" />
          <Row title="Risks" />
          <Row title="Download my data" onClick={() => notify("Your export is being prepared")} />
        </div>
      </section>
    </div>
    <button className="button quiet full" style={{ marginTop: 28 }} onClick={() => navigate("/signin")}>Sign out</button>
    <p className="fineprint center">Ownback v0.1 · Built with proof, not promises.</p>

    <Sheet open={rateOpen} onClose={() => setRateOpen(false)} title="Purchase rate">
      <div className="big-value"><span className="num">{rate}%</span><span className="sub">of each purchase</span></div>
      <input className="range" type="range" min={2} max={10} value={rate} onChange={e => { setRate(Number(e.target.value)); haptic(3); }} aria-label="Purchase rate" style={{ "--p": `${((rate - 2) / 8) * 100}%` } as React.CSSProperties} />
      <div className="range-ends"><span>2%</span><span>10%</span></div>
      <button className="button primary full" onClick={() => { setRateOpen(false); notify("Saved"); }}>Save</button>
    </Sheet>
  </div>;
}

const chains = ["Arc", "Solana", "Base", "Ethereum", "Arbitrum"];

/** QR-ish placeholder: deterministic pattern with finder squares. Real QR comes from `qrcode` with the API address. */
function QrMock() {
  const n = 21;
  const finder = (r: number, c: number) => [[0, 0], [0, n - 7], [n - 7, 0]].some(([fr, fc]) => {
    const y = r - fr, x = c - fc; if (y < 0 || x < 0 || y > 6 || x > 6) return false;
    return y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4);
  });
  const inFinderZone = (r: number, c: number) => [[0, 0], [0, n - 8], [n - 8, 0]].some(([fr, fc]) => r >= fr && r < fr + 8 && c >= fc && c < fc + 8);
  return <div className="qr" role="img" aria-label="QR code for your address">
    {Array.from({ length: n * n }, (_, i) => { const r = Math.floor(i / n), c = i % n; const on = inFinderZone(r, c) ? finder(r, c) : ((r * 7 + c * 13 + r * c) % 5) < 2; return <span key={i} className={on ? "on" : ""} />; })}
  </div>;
}

export function Funds() {
  const { navigate, notify } = useApp();
  const [chain, setChain] = useState("Arc");
  const [ago, setAgo] = useState(0);
  useEffect(() => { const t = setInterval(() => setAgo(a => (a >= 5 ? 0 : a + 1)), 1000); return () => clearInterval(t); }, []);
  const sol = chain === "Solana";
  return <div className="page flow wide">
    <FlowHead title="Add funds" back="/settings" />
    <p className="lede left">Send USDC from any chain we support. It all lands in one dollar balance, and we move what's needed to your vault on Arc.</p>
    <div className="segmented" role="radiogroup" aria-label="Method">
      <button role="radio" aria-checked className="on">Send USDC</button>
      <button role="radio" aria-checked={false} disabled>Card or UPI · Coming soon</button>
    </div>
    <div className="chips h-scroll" style={{ marginTop: 16 }}>
      {chains.map(c => <button key={c} className={`chip ${chain === c ? "on" : ""}`} onClick={() => { haptic(4); setChain(c); }}>{c}{c === "Arc" && <span className="chip-note">default</span>}</button>)}
    </div>
    <div className="two-col">
      <section className="card address">
        <QrMock />
        <strong>Your USDC address on {chain} · min $1</strong>
        <p className="mono addr">{sol ? "7xQk…3mPt" : "0x71F3…A92C"}</p>
        <button className="button secondary" onClick={() => { haptic(8); notify("Address copied"); }}><Copy size={16} /> Copy address</button>
        <p className="sub">{sol ? "Solana has its own address." : "Same address on Arc, Base, Ethereum, Arbitrum"}</p>
      </section>
      <div>
        <div className="watching"><span className="pulse" aria-hidden="true" /><div><strong>Watching {chain} for your USDC… checked {ago} s ago</strong><p className="sub">Checks every 5 s while this screen is open. Pull down or tap to check now.</p></div></div>
        <div className="insight"><span>Only USDC, only on {chain}.{!sol && " Solana has its own address."} Network fee $0.00 · we cover it.</span></div>
        <button className="button quiet full" style={{ marginTop: 16 }} onClick={() => navigate("/", { dir: "back" })}>Skip for now · we'll tell you when it lands</button>
      </div>
    </div>
  </div>;
}
