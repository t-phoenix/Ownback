"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft, ArrowRight, Bell, Camera, Check, CheckCircle2, ChevronRight, CircleDollarSign,
  FileText, Home as HomeIcon, Image as ImageIcon, Info, Landmark, LockKeyhole, Mail, Mic,
  Plus, ReceiptText, Search, Settings as SettingsIcon, ShieldCheck, Sparkles, Upload, UserRound,
  WalletCards, X, Zap
} from "lucide-react";
import { Logo } from "./logo";
import { holdings, receipts, split } from "../lib/fixtures";

type Navigate = (path: string) => void;
const tabs = [
  { path: "/", label: "Home", Icon: HomeIcon },
  { path: "/holdings", label: "Holdings", Icon: WalletCards },
  { path: "/add", label: "Add", Icon: Plus, add: true },
  { path: "/receipts", label: "Receipts", Icon: ReceiptText },
  { path: "/settings", label: "Settings", Icon: SettingsIcon },
];

function initials(name: string) { return name.slice(0, 2).toUpperCase(); }

export function OwnbackApp({ initialPath = "/" }: { initialPath?: string }) {
  const [path, setPath] = useState(initialPath);
  const [toast, setToast] = useState("");
  useEffect(() => { setPath(window.location.pathname); }, []);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    addEventListener("popstate", onPop); return () => removeEventListener("popstate", onPop);
  }, []);
  const navigate: Navigate = (next) => { history.pushState({}, "", next); setPath(next); scrollTo({ top: 0, behavior: "smooth" }); };
  const notify = (message: string) => { setToast(message); setTimeout(() => setToast(""), 2200); };
  const isTabs = ["/", "/holdings", "/add", "/receipts", "/settings"].includes(path);

  let screen: React.ReactNode;
  if (path === "/signin") screen = <SignIn navigate={navigate} />;
  else if (path === "/onboarding/rules") screen = <Rules navigate={navigate} />;
  else if (path === "/funds") screen = <Funds navigate={navigate} notify={notify} />;
  else if (path === "/add/reading") screen = <Reading navigate={navigate} />;
  else if (path === "/add/confirm") screen = <Confirm navigate={navigate} />;
  else if (path === "/add/saved") screen = <Saved navigate={navigate} />;
  else if (path === "/jars") screen = <Jars navigate={navigate} />;
  else if (path === "/buy/review") screen = <BuyReview navigate={navigate} />;
  else if (path === "/buy/done") screen = <BuyDone navigate={navigate} />;
  else if (path.startsWith("/holdings/")) screen = <Holding navigate={navigate} notify={notify} />;
  else if (path === "/holdings") screen = <Holdings navigate={navigate} />;
  else if (path === "/add") screen = <AddPurchase navigate={navigate} />;
  else if (path === "/receipts") screen = <Receipts navigate={navigate} />;
  else if (path === "/settings") screen = <Settings navigate={navigate} notify={notify} />;
  else screen = <Home navigate={navigate} />;

  return <main className="app">
    {screen}
    {isTabs && <BottomNav path={path} navigate={navigate} />}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}

function BottomNav({ path, navigate }: { path: string; navigate: Navigate }) {
  return <nav className="bottom-nav" aria-label="Main navigation">
    {tabs.map(({ path: itemPath, label, Icon, add }) => <button key={itemPath} className={`nav-item ${path === itemPath ? "active" : ""}`} onClick={() => navigate(itemPath)} aria-current={path === itemPath ? "page" : undefined}>
      {add ? <span className="nav-add"><Icon size={22} strokeWidth={2.2} /></span> : <Icon size={21} strokeWidth={path === itemPath ? 2.5 : 1.8} />}
      <span>{label}</span>
    </button>)}
  </nav>;
}

function Header({ navigate }: { navigate: Navigate }) {
  return <header className="topbar"><Logo /><button className="icon-button" aria-label="Activity" onClick={() => navigate("/jars")}><Bell size={20} /><span className="notify-dot" /></button></header>;
}

function FlowHead({ title, back, navigate }: { title: string; back: string; navigate: Navigate }) {
  return <header className="flow-head"><button className="back" aria-label="Back" onClick={() => navigate(back)}><ArrowLeft size={20} /></button><h1>{title}</h1><span /></header>;
}

function Home({ navigate }: { navigate: Navigate }) {
  return <div className="page"><Header navigate={navigate} />
    <div><span className="eyebrow">Good evening, Abhi</span><h1 className="headline">Your purchases are<br />building something.</h1></div>
    <button className="card balance-card" onClick={() => navigate("/holdings")} aria-label="View holdings, total balance $234.20">
      <div className="balance-label"><CircleDollarSign size={16} /> Total balance <ArrowRight size={15} /></div>
      <div className="balance">$234.20</div>
      <div className="balance-meta"><span className="glass-pill">$126.45 owned</span><span className="glass-pill">$107.75 dollars</span></div>
    </button>
    <div className="insight"><Sparkles size={18} /><span>You spent <strong>$955 on Apple</strong> this year. You now own $62.10.</span></div>
    <section className="section"><div className="section-head"><h2 className="section-title">Top holdings</h2><button className="link-button" onClick={() => navigate("/holdings")}>See all 11 <ChevronRight size={14} /></button></div>
      <div className="card list-card">{holdings.slice(0, 3).map(h => <HoldingRow key={h.name} h={h} navigate={navigate} />)}</div>
    </section>
    <section className="section"><div className="section-head"><h2 className="section-title">Next buy</h2><button className="link-button" onClick={() => navigate("/jars")}>View jars <ChevronRight size={14} /></button></div>
      <button className="card next-card" onClick={() => navigate("/jars")}><div><span className="status-pill"><Zap size={12} /> 3 jars ready</span><h3 style={{ margin: "10px 0 2px" }}>Ready, waiting for you</h3><p className="muted tiny" style={{ margin: 0 }}>Review live prices and fees</p><div className="progress"><span style={{ width: "78%" }} /></div></div><ArrowRight size={20} /></button>
    </section>
    <section className="section"><div className="section-head"><h2 className="section-title">Recent receipts</h2><button className="link-button" onClick={() => navigate("/receipts")}>All <ChevronRight size={14} /></button></div>
      <div className="card list-card receipt-card">{receipts.slice(0, 2).map(r => <ReceiptRow key={r.item} r={r} />)}</div>
    </section>
  </div>;
}

function HoldingRow({ h, navigate }: { h: typeof holdings[number]; navigate: Navigate }) {
  return <button className="row" onClick={() => navigate(`/holdings/${h.name.toLowerCase()}`)}><span className={`avatar ${h.tone}`}>{initials(h.name)}</span><span className="row-main"><span className="row-title">{h.name}</span><span className="row-sub">{h.qty} {h.token}</span></span><span className="row-end"><span className="row-value">{h.value}</span><span className="row-sub">In your wallet</span></span></button>;
}

function ReceiptRow({ r }: { r: typeof receipts[number] }) {
  return <button className="row"><span className="avatar sage"><ReceiptText size={19} /></span><span className="row-main"><span className="row-title">{r.item}</span><span className="row-sub">{r.shop} · {r.date} · {r.local}</span></span><span className="row-end"><span className="row-value">{r.saved}</span><span className="row-sub">{r.state}</span></span></button>;
}

function Holdings({ navigate }: { navigate: Navigate }) {
  return <div className="page"><div className="topbar"><h1 className="page-title">Holdings</h1><button className="link-button">Wallet <ChevronRight size={14} /></button></div>
    <div className="stat-grid"><div className="card stat"><span className="muted tiny">You own</span><strong>$126.45</strong><span className="tiny muted">Across 11 assets</span></div><div className="card stat"><span className="muted tiny">Dollars</span><strong>$107.75</strong><span className="tiny muted">Free + in jars</span></div></div>
    <div className="filters section"><button className="chip active">All</button><button className="chip">Companies</button><button className="chip">Materials</button><button className="chip">Solana</button></div>
    <section className="section"><div className="section-head"><h2 className="section-title">What you own</h2><span className="tiny muted">Updated just now</span></div><div className="card list-card">{holdings.map(h => <HoldingRow key={h.name} h={h} navigate={navigate} />)}</div></section>
    <section className="section"><h2 className="section-title">Your dollars</h2><div className="card list-card" style={{ marginTop: 12 }}><button className="row"><span className="avatar green">$</span><span className="row-main"><span className="row-title">Free to use</span><span className="row-sub">Across 4 chains</span></span><span className="row-value">$64.12</span></button><button className="row" onClick={() => navigate("/jars")}><span className="avatar gold"><CircleDollarSign size={19} /></span><span className="row-main"><span className="row-title">Waiting in jars</span><span className="row-sub">3 ready · 4 filling</span></span><span className="row-value">$43.63</span></button></div></section>
  </div>;
}

function Holding({ navigate, notify }: { navigate: Navigate; notify: (s: string) => void }) {
  return <div className="page flow"><FlowHead title="Apple" back="/holdings" navigate={navigate} />
    <div className="card confirm-hero"><div className="product-line"><span className="avatar green" style={{ width: 58, height: 58, fontSize: 18 }}>AP</span><div><span className="muted tiny">Apple · AAPLx</span><div className="balance" style={{ color: "var(--ink)", fontSize: 38, margin: "4px 0" }}>$62.10</div><span className="muted tiny">0.2096 AAPLx in your wallet</span></div></div></div>
    <p style={{ fontSize: 18, lineHeight: 1.45, margin: "22px 2px" }}>You spent <strong>$955.00</strong> on Apple this year. You now own <strong>$62.10</strong> of Apple.</p>
    <div className="section-head"><h2 className="section-title">Share it</h2><span className="tiny muted">Amounts hidden</span></div>
    <div className="dark-card"><span className="eyebrow" style={{ color: "var(--accent)" }}>Own what you buy.</span><h2 style={{ font: "700 26px var(--font-display)", margin: "15px 0 35px" }}>I bought an iPhone.<br />Now I own a piece of Apple.</h2><Logo /><div style={{ display: "flex", gap: 8, marginTop: 18 }}><button className="button secondary" onClick={() => notify("Share text copied")}>Copy text</button><button className="button ghost" style={{ color: "white" }} onClick={() => notify("Share card ready")}>More</button></div></div>
    <section className="section"><h2 className="section-title">Proof trail for the last buy</h2><div className="card list-card" style={{ marginTop: 12 }}>{["Receipt matched to Apple", "Dollars moved into your jar", "Apple bought at $296.31", "Ownership record published"].map((s, i) => <div className="row" key={s}><span className="check"><Check size={14} /></span><span className="row-main"><span className="row-title">{s}</span><span className="row-sub">{i === 0 ? "0G request 7f3a…" : "View proof"}</span></span><ChevronRight size={17} /></div>)}</div></section>
    <p className="privacy-note">AAPLx is issued by a third party; it tracks Apple stock but is not a share registered in your name.</p>
  </div>;
}

function AddPurchase({ navigate }: { navigate: Navigate }) {
  return <div className="page"><div className="topbar"><div><span className="eyebrow">Add</span><h1 className="page-title">A purchase</h1></div><button className="icon-button"><X size={19} /></button></div>
    <div className="card gmail-card"><div className="gmail-top"><span className="gmail-icon"><Mail size={20} /></span><div className="row-main"><div className="row-title">Connect Gmail</div><div className="row-sub">Find invoices automatically</div></div><button className="chip">Connect</button></div><p className="tiny muted" style={{ margin: "14px 0 0" }}>We only look at emails from shops. We never send, delete or keep emails.</p></div>
    <div className="add-grid"><button className="action-card" onClick={() => navigate("/add/reading")}><span className="action-icon"><Camera size={23} /></span><span><strong style={{ font: "700 23px var(--font-display)" }}>Snap or upload</strong><br /><span style={{ opacity: .75 }}>A receipt or order screenshot</span></span><ArrowRight /></button><button className="action-card" onClick={() => navigate("/add/reading")}><span className="action-icon"><Mic size={22} /></span><span><strong>Say it</strong><br /><span className="muted tiny">Record a voice note</span></span></button><button className="action-card" onClick={() => navigate("/add/confirm")}><span className="action-icon"><FileText size={22} /></span><span><strong>Type it</strong><br /><span className="muted tiny">Enter the details</span></span></button></div>
    <p className="privacy-note"><ShieldCheck size={15} style={{ verticalAlign: -3, marginRight: 5 }} /> Receipts and emails are read by a private AI model on 0G and not stored. Only shop, item, amount and date are kept.</p>
  </div>;
}

function Reading({ navigate }: { navigate: Navigate }) {
  const steps = ["Read the receipt · Croma, 3 Nov", "Converted ₹79,900 → $955.00 (₹83.66/$)", "Found the maker · Apple", "Finding companies behind it", "Checking which ones you can buy"];
  const [done, setDone] = useState(1);
  useEffect(() => { const t = setInterval(() => setDone(d => { if (d >= steps.length) { clearInterval(t); setTimeout(() => navigate("/add/confirm"), 500); return d; } return d + 1; }), 650); return () => clearInterval(t); }, []);
  return <div className="page flow"><FlowHead title="Reading your receipt" back="/add" navigate={navigate} /><div className="center" style={{ paddingTop: 18 }}><div className="success-orb" style={{ marginTop: 10 }}><ReceiptText size={36} /></div><h2 className="page-title" style={{ fontSize: 26 }}>Finding what’s inside</h2><p className="muted">This usually takes a few seconds.</p></div><div className="reading-steps">{steps.map((s, i) => <div key={s} className={`reading-step ${i < done ? "done" : ""}`}><span className="dot">{i < done ? <Check size={15} /> : i === done ? <Sparkles className="spinner" size={14} /> : null}</span><span>{s}</span></div>)}</div><p className="privacy-note">Read by a private AI model on 0G. The photo is deleted after reading.<br />Request ID 7f3a…9c2</p></div>;
}

function Confirm({ navigate }: { navigate: Navigate }) {
  return <div className="page flow"><FlowHead title="Confirm purchase" back="/add" navigate={navigate} />
    <div className="card confirm-hero"><div className="product-line"><div className="product-art" /><div><span className="eyebrow">Croma · 3 Nov</span><h2 style={{ margin: "4px 0", font: "700 22px var(--font-display)" }}>iPhone 16 Pro</h2><span className="muted">₹79,900 → $955.00</span></div></div><div className="summary-line" style={{ marginTop: 16, paddingBottom: 0 }}><span>Your 5%</span><strong>$47.75</strong></div></div>
    <div className="section-head section"><div><span className="eyebrow">The match</span><h2 className="section-title" style={{ marginTop: 4 }}>What’s inside your iPhone</h2></div><button className="link-button">Edit split</button></div>
    <div className="splitbar" aria-label="70% maker, 20% suppliers, 10% materials">{split.map(s => <span key={s.name} style={{ width: `${s.pct}%`, background: s.name === "Apple" ? "var(--primary)" : s.role === "Material" ? "var(--accent)" : "#75b89b" }} />)}</div><p className="tiny muted" style={{ marginTop: 6 }}>70% maker · 20% behind it · 10% materials</p>
    <div className="card" style={{ padding: "2px 16px" }}>{split.map(s => <div className="split-row" key={s.name}><span className="check"><Check size={14} /></span><span className={`avatar ${s.tone}`} style={{ width: 36, height: 36 }}>{initials(s.name)}</span><span className="row-main"><span className="row-title">{s.name}</span><span className="role-pill">{s.role}</span></span><span className="row-end"><strong>{s.amount}</strong>{s.ready && <div className="tiny" style={{ color: "var(--primary)" }}>Jar ready</div>}</span></div>)}</div>
    <button className="link-button full" style={{ width: "100%" }}>Why these companies?</button><div className="fee-line"><ShieldCheck size={15} /> Network fee $0.00 · we cover it</div>
    <div className="sticky-action"><button className="button primary full" onClick={() => navigate("/add/saved")}>Confirm $47.75 across 6 <ArrowRight size={18} /></button><button className="button ghost full" style={{ marginTop: 8 }}>Only Apple</button></div>
  </div>;
}

function Saved({ navigate }: { navigate: Navigate }) {
  return <div className="page flow center"><div className="success-orb"><Check size={42} strokeWidth={2.5} /></div><span className="eyebrow">Purchase saved</span><h1 className="headline">$47.75 is in<br />6 jars</h1><p className="muted" style={{ fontSize: 17, lineHeight: 1.45 }}>Apple’s jar is ready. Tap to buy when you want. The others fill up from your next purchases.</p><div className="card" style={{ padding: 18, textAlign: "left", margin: "28px 0" }}><div className="summary-line"><span>Apple</span><strong>$33.43 · ready</strong></div><div className="summary-line"><span>5 more jars</span><strong>$14.32 · filling</strong></div></div><button className="button primary full" onClick={() => navigate("/jars")}>View your jars</button><button className="button ghost full" style={{ marginTop: 10 }} onClick={() => navigate("/add")}>Add another purchase</button><button className="link-button" onClick={() => navigate("/")}>Go home</button></div>;
}

function Jars({ navigate }: { navigate: Navigate }) {
  const jars = [{ name: "Apple", amount: "$33.43", pct: 100, label: "Ready · tap to buy", tone: "green" }, { name: "TSMC", amount: "$6.10", pct: 100, label: "Ready · tap to buy", tone: "mint" }, { name: "Gold", amount: "$5.10", pct: 100, label: "Ready · tap to buy", tone: "gold" }, { name: "Qualcomm", amount: "$3.18", pct: 64, label: "Buy now anyway · fees $0.11 (3.5%)", tone: "clay" }];
  return <div className="page flow"><FlowHead title="Your jars" back="/" navigate={navigate} /><p className="muted" style={{ lineHeight: 1.5 }}>Dollars wait in your vault on Arc. When a jar reaches $5 we’ll remind you on Sunday. Nothing buys without your OK.</p><div className="section-head section"><h2 className="section-title">3 ready to buy</h2><strong>$44.63</strong></div><div className="card list-card">{jars.map(j => <button key={j.name} className="row" onClick={() => navigate("/buy/review")}><span className={`avatar ${j.tone}`}>{initials(j.name)}</span><span className="row-main"><span className="row-title">{j.name}</span><div className="jar"><span style={{ width: `${j.pct}%`, background: j.pct === 100 ? "var(--primary)" : "var(--accent)" }} /></div><span className="row-sub" style={{ color: j.pct === 100 ? "var(--primary)" : undefined }}>{j.label}</span></span><strong>{j.amount}</strong></button>)}</div><div className="sticky-action"><button className="button primary full" onClick={() => navigate("/buy/review")}>Review and buy 3 jars <ArrowRight size={18} /></button></div></div>;
}

function BuyReview({ navigate }: { navigate: Navigate }) {
  const quotes = [{ name: "Apple", token: "AAPLx", amount: "$33.43", qty: "0.1128", price: "$296.31", fee: "$0.18 · 0.5%", tone: "green" }, { name: "TSMC", token: "TSMx", amount: "$6.10", qty: "0.0215", price: "$283.72", fee: "$0.07 · 1.1%", tone: "mint" }, { name: "Gold", token: "PAXG", amount: "$5.10", qty: "0.0017", price: "$2,947", fee: "$0.06 · 1.2%", tone: "gold" }];
  return <div className="page flow"><FlowHead title="Buy 3 ready jars" back="/jars" navigate={navigate} /><div className="insight" style={{ marginBottom: 18 }}><Zap size={17} /><span>Prices update live · next in <strong>24 s</strong></span></div>{quotes.map(q => <div className="card quote-card" key={q.name}><div className="quote-top"><span className={`avatar ${q.tone}`}>{initials(q.name)}</span><div className="row-main"><div className="row-title">{q.name} <span className="muted">({q.token})</span></div><div className="row-sub">Best price on Solana</div></div><strong>{q.amount}</strong></div><div className="quote-details"><span>Price now<strong>{q.price}</strong></span><span>You get about<strong>{q.qty} {q.token}</strong></span><span>Price protection<strong>+1% max</strong></span><span>Fees<strong>{q.fee}</strong></span></div></div>)}<div className="card summary" style={{ marginTop: 16 }}><div className="summary-line"><span>From your jars</span><strong>$44.63</strong></div><div className="summary-line"><span>Fees</span><strong>$0.31 (0.7%)</strong></div><div className="summary-line"><span>Your fee limit</span><strong>5%</strong></div></div><p className="privacy-note">Shares go straight to your Solana wallet 7xQk…3mPt.</p><div className="sticky-action"><button className="button primary full" onClick={() => navigate("/buy/done")}>Buy now · $44.63 <ArrowRight size={18} /></button></div></div>;
}

function BuyDone({ navigate }: { navigate: Navigate }) {
  return <div className="page flow"><FlowHead title="Buy done" back="/" navigate={navigate} /><div className="center"><div className="success-orb"><Check size={42} /></div><span className="eyebrow">In your wallet</span><h1 className="headline">You bought<br />3 assets</h1><p className="muted">$44.32 bought · $0.31 fees · 6 Nov</p></div><div className="card list-card" style={{ marginTop: 28 }}>{holdings.slice(0, 3).map((h, i) => <button className="row" key={h.name} onClick={() => navigate(`/holdings/${h.name.toLowerCase()}`)}><span className={`avatar ${h.tone}`}><Check size={18} /></span><span className="row-main"><span className="row-title">{h.name}</span><span className="row-sub">Bought at {i === 0 ? "$296.31" : i === 1 ? "$283.72" : "$2,947"}</span></span><strong>{["$33.25", "$6.03", "$5.04"][i]}</strong></button>)}</div><div className="card summary" style={{ marginTop: 14 }}><div className="summary-line"><span>Paid vs quote</span><strong>within 0.2%</strong></div><div className="summary-line"><span>Left in jars</span><strong>$3.18</strong></div></div><button className="button primary full" style={{ marginTop: 20 }} onClick={() => navigate("/holdings/apple")}>See what you own</button><button className="button ghost full" style={{ marginTop: 10 }}>Share what I own</button></div>;
}

function Receipts({ navigate }: { navigate: Navigate }) {
  return <div className="page"><div className="topbar"><h1 className="page-title">Receipts</h1><button className="icon-button"><Search size={19} /></button></div><div className="filters"><button className="chip active">All 23</button><button className="chip">Needs review 2</button><button className="chip">Matched 21</button></div><section className="section"><div className="card list-card receipt-card">{[...receipts, ...receipts, ...receipts].map((r, i) => <ReceiptRow key={`${r.item}-${i}`} r={{ ...r, date: i > 2 ? `${26 - i} Oct` : r.date }} />)}</div></section><button className="button secondary full" style={{ marginTop: 24 }}>See 14 more</button></div>;
}

function Settings({ navigate, notify }: { navigate: Navigate; notify: (s: string) => void }) {
  const [push, setPush] = useState(true); const [gmail, setGmail] = useState(false);
  return <div className="page"><div className="topbar"><h1 className="page-title">Settings</h1><span className="avatar green"><UserRound size={19} /></span></div><section><p className="settings-label">Investing</p><div className="card list-card"><SettingRow title="Purchase rate" value="5%" /><SettingRow title="Monthly limit" value="$50" /><SettingRow title="Max fees" value="5%" /><SettingRow title="Ready when" value="$5" /><SettingRow title="Fallback" value="S&P 500" /></div></section><section className="settings-group"><p className="settings-label">Money & access</p><div className="card list-card"><SettingRow title="Wallets and sign-in" value="2 wallets" icon={<WalletCards size={18} />} /><button className="row" onClick={() => navigate("/funds")}><span className="action-icon" style={{ width: 36, height: 36 }}><Plus size={18} /></span><span className="row-main row-title">Add funds</span><ChevronRight size={17} /></button></div></section><section className="settings-group"><p className="settings-label">Connections</p><div className="card list-card"><ToggleRow title="Purchase reminders" value={push} onChange={() => setPush(!push)} /><ToggleRow title="Gmail receipts" value={gmail} onChange={() => setGmail(!gmail)} /></div></section><section className="settings-group"><p className="settings-label">Privacy & help</p><div className="card list-card"><SettingRow title="How Ownback works" /><SettingRow title="Risks" /><button className="row" onClick={() => notify("Your export is being prepared")}><span className="row-main row-title">Download my data</span><ChevronRight size={17} /></button></div></section><button className="button ghost full" style={{ marginTop: 24 }}>Sign out</button><p className="privacy-note">Ownback v0.1 · Built with proof, not promises.</p></div>;
}

function SettingRow({ title, value, icon }: { title: string; value?: string; icon?: React.ReactNode }) { return <button className="row">{icon && <span className="action-icon" style={{ width: 36, height: 36 }}>{icon}</span>}<span className="row-main row-title">{title}</span>{value && <span className="muted">{value}</span>}<ChevronRight size={17} /></button>; }
function ToggleRow({ title, value, onChange }: { title: string; value: boolean; onChange: () => void }) { return <div className="row"><span className="row-main row-title">{title}</span><button className={`switch ${value ? "on" : ""}`} role="switch" aria-checked={value} onClick={onChange}><span /></button></div>; }

function SignIn({ navigate }: { navigate: Navigate }) {
  return <div className="page flow welcome"><Logo /><div className="welcome-art"><div className="welcome-card"><span className="eyebrow">Croma · iPhone</span><strong style={{ display: "block", margin: "8px 0" }}>₹79,900 → $47.75</strong><div className="splitbar"><span style={{ width: "70%", background: "var(--primary)" }} /><span style={{ width: "20%", background: "#75b89b" }} /><span style={{ width: "10%", background: "var(--accent)" }} /></div><span className="tiny muted">Apple · TSMC · Corning · Gold</span></div></div><span className="eyebrow">Own what you buy.</span><h1 className="headline">Own a piece of what you buy.</h1><p className="muted" style={{ fontSize: 17, lineHeight: 1.45 }}>A small share of every purchase goes into the companies behind it.</p><div style={{ marginTop: "auto" }}><button className="button primary full" onClick={() => navigate("/onboarding/rules")}><Mail size={18} /> Continue with Google</button><button className="button ghost full" style={{ marginTop: 10 }} onClick={() => navigate("/onboarding/rules")}><LockKeyhole size={18} /> Use a seed phrase</button><p className="privacy-note">By continuing you accept the Terms · Risks</p></div></div>;
}

function Rules({ navigate }: { navigate: Navigate }) {
  const [rate, setRate] = useState(5); const [limit, setLimit] = useState(50);
  return <div className="page flow"><FlowHead title="Set your rules" back="/signin" navigate={navigate} /><span className="eyebrow">Step 1 of 2</span><h1 className="headline">Make every purchase count.</h1><p className="muted">You can change these any time.</p><div className="card rule-card"><div className="section-head"><div><strong>How much of each purchase?</strong><div className="row-sub">Between 2% and 10%</div></div><strong style={{ font: "700 28px var(--font-display)" }}>{rate}%</strong></div><input className="range" type="range" min="2" max="10" value={rate} onChange={e => setRate(Number(e.target.value))} /><div className="insight"><Info size={17} /><span>$955 iPhone → <strong>${(955 * rate / 100).toFixed(2)}</strong> into Apple and the companies behind it.</span></div></div><div className="card rule-card"><div className="section-head"><div><strong>Monthly limit</strong><div className="row-sub">The vault enforces it</div></div><strong style={{ font: "700 28px var(--font-display)" }}>${limit}</strong></div><input className="range" type="range" min="10" max="200" step="10" value={limit} onChange={e => setLimit(Number(e.target.value))} /></div><div className="card list-card"><SettingRow title="Max fees" value="5%" /><SettingRow title="Ready when" value="$5" /><SettingRow title="If a company isn’t listed" value="S&P 500" /></div><div className="sticky-action"><button className="button primary full" onClick={() => navigate("/funds")}>Add $20 to start <ArrowRight size={18} /></button></div></div>;
}

function Funds({ navigate, notify }: { navigate: Navigate; notify: (s: string) => void }) {
  const [chain, setChain] = useState("Arc");
  return <div className="page flow"><FlowHead title="Add funds" back="/settings" navigate={navigate} /><p className="muted" style={{ lineHeight: 1.5 }}>Send USDC from any chain we support. It all lands in one dollar balance, and we move what’s needed to your vault on Arc.</p><div className="pill-choice" style={{ margin: "20px 0" }}><button className="chip active">Send USDC</button><button className="chip" disabled>Card or UPI · soon</button></div><div className="filters">{["Arc", "Solana", "Base", "Ethereum", "Arbitrum"].map(c => <button key={c} className={`chip ${chain === c ? "active" : ""}`} onClick={() => setChain(c)}>{c}{c === "Arc" && " · default"}</button>)}</div><div className="card center" style={{ padding: 24, marginTop: 18 }}><div style={{ width: 176, height: 176, margin: "0 auto 18px", padding: 16, border: "1px solid var(--line)", borderRadius: 18, background: "white", display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>{Array.from({ length: 49 }, (_, i) => <span key={i} style={{ background: [0, 1, 5, 6].includes(i % 7) || (i * 7) % 11 < 3 ? "#0e2a1f" : "transparent", borderRadius: 2 }} />)}</div><strong>Your USDC address on {chain} · min $1</strong><p className="muted tiny">0x71F3…A92C</p><button className="button secondary" onClick={() => notify("Address copied")}>Copy address</button></div>{["Base", "Ethereum", "Arbitrum"].includes(chain) && <div className="card row" style={{ marginTop: 14 }}><span className="avatar green"><Zap size={18} /></span><span className="row-main"><span className="row-title">Auto-add from {chain}</span><span className="row-sub">Up to $1,000 · one approval</span></span><button className="switch on"><span /></button></div>}<div className="insight"><ShieldCheck size={18} /><span>Only USDC, only on {chain}. Network fee $0.00 · we cover it.</span></div><button className="link-button full" style={{ width: "100%", marginTop: 18 }} onClick={() => navigate("/")}>Skip for now · we’ll tell you when it lands</button></div>;
}
