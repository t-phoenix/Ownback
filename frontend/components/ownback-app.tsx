"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Bell, Home as HomeIcon, Plus, ReceiptText, RefreshCw, Settings as SettingsIcon, Upload, WalletCards } from "lucide-react";
import { Logo } from "./logo";
import { App, type Navigate } from "./app-context";
import { haptic } from "./ui";
import { useSession } from "./session-context";
import { refreshAll } from "../lib/use-api";

/** Privy stays out of the SSR/preload graph so next dev does not hold the whole WalletConnect tree at boot. */
const SessionProvider = dynamic(
  () => import("./session").then((m) => m.SessionProvider),
  { ssr: false },
);
import { Home, Activity } from "./screens/home";
import { Holdings, Holding } from "./screens/holdings";
import { AddPurchase, Reading, ReadError, TypeIt, Confirm, Saved, startRead } from "./screens/add";
import { Jars, BuyReview, BuyDone, SellReview, SellDone } from "./screens/buy";
import { Receipts } from "./screens/receipts";
import { Settings, Funds } from "./screens/settings";
import { SignIn, Rules } from "./screens/onboarding";

const tabs = [
  { path: "/", label: "Home", Icon: HomeIcon, key: "H" },
  { path: "/holdings", label: "Holdings", Icon: WalletCards, key: "O" },
  { path: "/add", label: "Add", Icon: Plus, key: "A", add: true },
  { path: "/receipts", label: "Receipts", Icon: ReceiptText, key: "R" },
  { path: "/settings", label: "Settings", Icon: SettingsIcon, key: "S" },
];
const tabPaths = tabs.map(t => t.path);

export function OwnbackApp({ initialPath = "/" }: { initialPath?: string }) {
  return <SessionProvider><Shell initialPath={initialPath} /></SessionProvider>;
}

function Shell({ initialPath }: { initialPath: string }) {
  const { me } = useSession();
  const [path, setPath] = useState(initialPath);
  const [dir, setDir] = useState<"fwd" | "back" | "left" | "right">("fwd");
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [dropping, setDropping] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { setPath(window.location.pathname + window.location.search); }, []);
  useEffect(() => {
    const onPop = () => { setDir("back"); setPath(window.location.pathname + window.location.search); };
    addEventListener("popstate", onPop); return () => removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    try { const t = localStorage.getItem("ob-theme"); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch { /* storage blocked */ }
  }, []);

  const navigate: Navigate = useCallback((next, opts) => {
    if (next === window.location.pathname + window.location.search) return;
    const from = tabPaths.indexOf(window.location.pathname), to = tabPaths.indexOf(next.split("?")[0]);
    setDir(opts?.dir ?? (from > -1 && to > -1 ? (to > from ? "left" : "right") : "fwd"));
    history.pushState({}, "", next); setPath(next);
    scrollTo({ top: 0 });
  }, []);
  const notify = useCallback((text: string) => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text });
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);
  const ctx = useMemo(() => ({ navigate, notify, path }), [navigate, notify, path]);

  const [route, query] = path.split("?");
  const isTab = tabPaths.includes(route);
  const isBare = route === "/signin" || route.startsWith("/onboarding");

  /* Session gate: signed out → Sign in; signed in on Sign in → rules (first time) or Home. */
  useEffect(() => {
    if (me === undefined) return;
    if (me === null && route !== "/signin") { history.replaceState({}, "", "/signin"); setPath("/signin"); }
    if (!me) return;
    // Rules are set once; after that they live in Settings. Onboarded users never see the rules screen again.
    const to = !me.onboarded ? (route === "/onboarding/rules" || route === "/funds" ? null : "/onboarding/rules")
      : route === "/signin" || route === "/onboarding/rules" ? "/" : null;
    if (to) { history.replaceState({}, "", to); setPath(to); }
  }, [me, route]);

  /* Desktop: single-key shortcuts. Reaching for the keyboard is faster than the mouse for regulars. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable]")) return;
      const map: Record<string, string> = { h: "/", o: "/holdings", a: "/add", r: "/receipts", s: "/settings", j: "/jars", n: "/activity" };
      const to = map[e.key.toLowerCase()];
      if (to) { e.preventDefault(); navigate(to); }
    };
    addEventListener("keydown", onKey); return () => removeEventListener("keydown", onKey);
  }, [navigate]);

  /* Desktop: drop a receipt file anywhere, or paste a screenshot. The file is never stored by us. */
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; depth++; setDropping(true); };
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) setDropping(false); };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return; e.preventDefault(); depth = 0; setDropping(false);
      const f = e.dataTransfer?.files[0];
      if (f && f.type.startsWith("image/")) startRead({ kind: "image", file: f, name: f.name }, navigate);
    };
    const paste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement).closest?.("input, textarea")) return;
      const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith("image/"));
      const f = item?.getAsFile();
      if (f) { e.preventDefault(); startRead({ kind: "image", file: f, name: f.name || "screenshot.png" }, navigate); }
    };
    addEventListener("dragenter", enter); addEventListener("dragleave", leave); addEventListener("dragover", over); addEventListener("drop", drop); addEventListener("paste", paste);
    return () => { removeEventListener("dragenter", enter); removeEventListener("dragleave", leave); removeEventListener("dragover", over); removeEventListener("drop", drop); removeEventListener("paste", paste); };
  }, [navigate]);

  /* Phone: swipe sideways between tabs, pull down to refresh. */
  const touch = useRef<{ x: number; y: number; axis: "x" | "y" | null; ok: boolean } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const blocked = !!(e.target as HTMLElement).closest("[data-noswipe], input, .h-scroll, .sheet, .slide-confirm");
    touch.current = { x: t.clientX, y: t.clientY, axis: null, ok: isTab && !blocked };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touch.current; if (!s || !s.ok) return;
    const t = e.touches[0]; const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (!s.axis && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) s.axis = Math.abs(dx) > Math.abs(dy) * 1.4 ? "x" : "y";
    if (s.axis === "y" && dy > 0 && window.scrollY <= 0 && !refreshing) setPull(Math.min(110, dy * 0.5));
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current; touch.current = null; if (!s || !s.ok) return;
    const t = e.changedTouches[0]; const dx = t.clientX - s.x;
    if (s.axis === "x" && Math.abs(dx) > 80) {
      const i = tabPaths.indexOf(route); const ni = dx < 0 ? i + 1 : i - 1;
      if (ni >= 0 && ni < tabPaths.length) { haptic(6); navigate(tabPaths[ni]); }
    }
    if (pull > 64) {
      haptic([6, 30, 6]); setRefreshing(true); setPull(56);
      refreshAll();
      setTimeout(() => { setRefreshing(false); setPull(0); notify("Updated just now"); }, 700);
    } else if (!refreshing) setPull(0);
  };

  const seg = route.split("/").filter(Boolean);
  let screen: React.ReactNode;
  // The landing renders on the server too, so crawlers and slow phones see real content, not a spinner.
  if (me === undefined && route === "/signin") screen = <SignIn />;
  else if (me === undefined) screen = <div className="splash" aria-busy="true"><Logo /></div>;
  else if (route === "/signin" || me === null) screen = <SignIn />;
  else if (route === "/onboarding/rules") screen = <Rules />;
  else if (route === "/funds") screen = <Funds />;
  else if (route === "/activity") screen = <Activity />;
  else if (route === "/add/reading") screen = <Reading />;
  else if (route === "/add/error") screen = <ReadError />;
  else if (route === "/add/type") screen = <TypeIt />;
  else if (seg[0] === "add" && seg[1] && seg[2] === "saved") screen = <Saved id={seg[1]} />;
  else if (seg[0] === "add" && seg[1]) screen = <Confirm id={seg[1]} />;
  else if (route === "/jars") screen = <Jars />;
  else if (route === "/buy/review") { const q = new URLSearchParams(query ?? ""); screen = <BuyReview all={q.has("all")} assetId={q.get("asset") ?? undefined} />; }
  else if (seg[0] === "buy" && seg[1]) screen = <BuyDone batchId={seg[1]} />;
  else if (seg[0] === "sell" && seg[1] === "review" && seg[2]) screen = <SellReview assetId={decodeURIComponent(seg[2])} />;
  else if (seg[0] === "sell" && seg[1]) screen = <SellDone sellId={seg[1]} />;
  else if (seg[0] === "holdings" && seg[1]) screen = <Holding id={decodeURIComponent(seg[1])} />;
  else if (route === "/holdings") screen = <Holdings />;
  else if (route === "/add") screen = <AddPurchase />;
  else if (route === "/receipts") screen = <Receipts />;
  else if (route === "/settings") screen = <Settings />;
  else screen = <Home />;

  const bare = isBare || !me;
  return <App.Provider value={ctx}>
    <div className={`shell ${bare ? "bare" : ""} ${isTab && me ? "has-tabs" : ""}`}>
      {!bare && <Sidebar path={route} navigate={navigate} />}
      <main className="stage" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        {isTab && <div className={`ptr ${refreshing ? "spin" : ""}`} style={{ height: pull, opacity: Math.min(1, pull / 60) }} aria-hidden="true"><RefreshCw size={18} style={{ transform: `rotate(${pull * 3}deg)` }} /></div>}
        <div key={path} className={`screen enter-${dir}`}>{screen}</div>
      </main>
      {isTab && me && <TabBar path={route} navigate={navigate} />}
      {toast && <div key={toast.id} className="toast" role="status">{toast.text}</div>}
      {dropping && <div className="drop-veil" aria-hidden="true"><div className="drop-card"><Upload size={28} /><strong>Drop your receipt</strong><span>Read by a private AI model on 0G. The photo is deleted after reading.</span></div></div>}
    </div>
  </App.Provider>;
}

function TabBar({ path, navigate }: { path: string; navigate: Navigate }) {
  return <nav className="tabbar" aria-label="Main navigation">
    {tabs.map(({ path: p, label, Icon, add }) => {
      const active = path === p;
      return <button key={p} className={`tab ${active ? "active" : ""} ${add ? "tab-add" : ""}`} aria-current={active ? "page" : undefined}
        onClick={() => { haptic(5); navigate(p); }}>
        {add ? <span className="tab-add-disc"><Icon size={24} strokeWidth={2.4} /></span> : <Icon size={22} strokeWidth={active ? 2.3 : 1.75} />}
        <span className="tab-label">{label}</span>
      </button>;
    })}
  </nav>;
}

function Sidebar({ path, navigate }: { path: string; navigate: Navigate }) {
  return <aside className="sidebar" aria-label="Main navigation">
    <button className="sidebar-logo" onClick={() => navigate("/")} aria-label="Ownback home"><Logo /></button>
    <button className="button primary full sidebar-add" onClick={() => navigate("/add")}><Plus size={18} strokeWidth={2.4} /> Add a purchase <kbd>A</kbd></button>
    <nav className="side-nav">
      {tabs.filter(t => !t.add).map(({ path: p, label, Icon, key }) => {
        const active = p === "/" ? path === "/" : path.startsWith(p);
        return <button key={p} className={`side-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => navigate(p)}>
          <Icon size={19} strokeWidth={active ? 2.2 : 1.75} /><span>{label}</span><kbd>{key}</kbd>
        </button>;
      })}
      <button className={`side-item ${path === "/activity" ? "active" : ""}`} onClick={() => navigate("/activity")}><Bell size={19} strokeWidth={1.75} /><span>Activity</span><kbd>N</kbd></button>
    </nav>
    <div className="side-ritual">
      <span className="ritual-icon"><Bell size={18} /></span>
      <div><strong>Buy day is Sunday</strong><span>We'll remind you when jars are ready.</span></div>
    </div>
    <p className="side-foot">Drop a receipt anywhere, or paste a screenshot.</p>
  </aside>;
}
