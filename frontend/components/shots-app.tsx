"use client";

import { useEffect, useMemo, useState } from "react";
import { Home as HomeIcon, PiggyBank, Plus, ReceiptText, WalletCards } from "lucide-react";
import { App } from "./app-context";
import { MockSessionProvider } from "./session-context";
import { Home } from "./screens/home";
import { Holdings } from "./screens/holdings";
import { Confirm, TypeIt } from "./screens/add";
import { Receipts } from "./screens/receipts";
import { Settings } from "./screens/settings";
import { Jars, BuyReview, BuyDone } from "./screens/buy";
import { SignIn } from "./screens/onboarding";
import { Markets, MarketAsset } from "./screens/markets";
import { installShotApi } from "../lib/install-shot-api";
import { me, SHOT_IDS, type ShotScreen } from "../lib/shot-fixtures";

const tabs = [
  { path: "/", label: "Home", Icon: HomeIcon },
  { path: "/holdings", label: "Holdings", Icon: WalletCards },
  { path: "/add", label: "Add", Icon: Plus, add: true },
  { path: "/receipts", label: "Receipts", Icon: ReceiptText },
  { path: "/jars", label: "Jars", Icon: PiggyBank },
];

const meta: Record<ShotScreen, { path: string; tab?: string; bare?: boolean }> = {
  signin: { path: "/signin", bare: true },
  home: { path: "/", tab: "/" },
  confirm: { path: `/add/${SHOT_IDS.purchase}` },
  jars: { path: "/jars", tab: "/jars" },
  "buy-review": { path: "/buy/review" },
  "buy-done": { path: `/buy/${SHOT_IDS.batch}` },
  holdings: { path: "/holdings", tab: "/holdings" },
  receipts: { path: "/receipts", tab: "/receipts" },
  settings: { path: "/settings" },
  "type-it": { path: "/add/type" },
  markets: { path: "/markets" },
  "market-asset": { path: "/markets/co:apple" },
  "markets-wide": { path: "/markets" },
  "market-asset-wide": { path: "/markets/co:apple" },
  "confirm-wide": { path: `/add/${SHOT_IDS.purchase}` },
  "jars-wide": { path: "/jars", tab: "/jars" },
};

installShotApi();

export function ShotsApp({ screen }: { screen: ShotScreen }) {
  const [ready, setReady] = useState(false);
  const cfg = meta[screen];
  const navigate = () => {};
  const ctx = useMemo(() => ({ navigate, notify: () => {}, path: cfg.path }), [cfg.path]);

  useEffect(() => {
    document.documentElement.dataset.theme = "light";
    // Let CountUp / fonts settle before Playwright snaps.
    const t = setTimeout(() => setReady(true), 600);
    return () => clearTimeout(t);
  }, [screen]);

  let body: React.ReactNode;
  if (screen === "signin") body = <SignIn />;
  else if (screen === "home") body = <Home />;
  else if (screen === "confirm" || screen === "confirm-wide") body = <Confirm id={SHOT_IDS.purchase} />;
  else if (screen === "jars" || screen === "jars-wide") body = <Jars />;
  else if (screen === "buy-review") body = <BuyReview />;
  else if (screen === "holdings") body = <Holdings />;
  else if (screen === "receipts") body = <Receipts />;
  else if (screen === "settings") body = <Settings />;
  else if (screen === "type-it") body = <TypeIt />;
  else if (screen === "markets" || screen === "markets-wide") body = <Markets />;
  else if (screen === "market-asset" || screen === "market-asset-wide") body = <MarketAsset id="co:apple" />;
  else body = <BuyDone batchId={SHOT_IDS.batch} />;

  const showTabs = !!cfg.tab;

  return <MockSessionProvider me={cfg.bare ? null : me}>
    <App.Provider value={ctx}>
      <div className="shots-stage" data-shot-ready={ready ? "1" : "0"}>
        <div className={screen.endsWith("-wide") ? "shots-wide" : "shots-phone"} data-shot={screen}>
          <div className="shots-notch" aria-hidden="true" />
          <div className={`shell ${cfg.bare ? "bare" : ""} ${showTabs ? "has-tabs" : ""}`}>
            <main className="stage"><div className="screen">{body}</div></main>
            {showTabs && <nav className="tabbar" aria-hidden="true">
              {tabs.map(({ path, label, Icon, add }) => {
                const active = cfg.tab === path;
                return <button key={path} className={`tab ${active ? "active" : ""} ${add ? "tab-add" : ""}`} tabIndex={-1}>
                  {add ? <span className="tab-add-disc"><Icon size={24} strokeWidth={2.4} /></span> : <Icon size={22} strokeWidth={active ? 2.3 : 1.75} />}
                  <span className="tab-label">{label}</span>
                </button>;
              })}
            </nav>}
          </div>
        </div>
        <p className="shots-caption">{labelFor(screen)}</p>
      </div>
    </App.Provider>
  </MockSessionProvider>;
}

function labelFor(s: ShotScreen) {
  return ({
    signin: "1 · Sign in",
    home: "2 · Home — vault and jars",
    confirm: "3 · Confirm — receipt becomes ownership",
    jars: "4 · Jars — dollars waiting on Arc",
    "buy-review": "5 · Buy review — you approve",
    "buy-done": "6 · Buy done — shares in your wallet",
    holdings: "7 · Holdings — what you own",
    receipts: "8 · Receipts — everything you added",
    settings: "9 · Settings — your rules",
    "type-it": "10 · Type it — add a purchase by hand",
    markets: "11 · Markets — buy and sell directly",
    "market-asset": "12 · Asset — chart, position, trade",
    "markets-wide": "13 · Markets on laptop — table and preview",
    "market-asset-wide": "14 · Asset on laptop — trade panel inline",
    "confirm-wide": "15 · Confirm on laptop — set your amounts",
    "jars-wide": "16 · Jars on laptop — brand jars",
  } as const)[s];
}
