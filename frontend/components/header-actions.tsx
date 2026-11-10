"use client";

import { useEffect, useState } from "react";
import { Bell, ChartCandlestick, PiggyBank, Settings } from "lucide-react";
import { useApp } from "./app-context";
import { useApi } from "../lib/use-api";
import { api } from "../lib/api";
import { marketsOn } from "../lib/flags";

/**
 * D34 · Phone header icons. The phone tab bar holds only Home · Holdings · Add · Receipts · Jars,
 * so Markets, Activity, Jars (on Holdings) and Settings live here. Hidden from 900 px, where the sidebar has them.
 */
export type HeaderAction = "jars" | "markets" | "activity" | "settings";

const SEEN = "ob:activity-seen";
export function markActivitySeen() { try { localStorage.setItem(SEEN, new Date().toISOString()); } catch { /* blocked */ } }

function useUnseenActivity(): number {
  const a = useApi("activity", api.activity);
  const [seen, setSeen] = useState<string | null>(null);
  useEffect(() => { try { setSeen(localStorage.getItem(SEEN)); } catch { /* blocked */ } }, []);
  const items = a.data?.groups.flatMap(g => g.items) ?? [];
  return seen ? items.filter(i => i.at > seen).length : 0;
}

function ActivityBell() {
  const { navigate } = useApp();
  const unseen = useUnseenActivity();
  return <button className="icon-btn" aria-label={unseen ? `Activity, ${unseen} new` : "Activity"} onClick={() => navigate("/activity")}>
    <Bell size={20} strokeWidth={1.75} />{unseen > 0 && <span className="dot" />}
  </button>;
}

export function HeaderActions({ items }: { items: HeaderAction[] }) {
  const { navigate } = useApp();
  return <div className="header-actions only-mobile">
    {items.map(k => {
      if (k === "activity") return <ActivityBell key={k} />;
      if (k === "markets" && !marketsOn) return null;
      const [label, to, Icon] = k === "jars" ? ["Jars", "/jars", PiggyBank] as const
        : k === "markets" ? ["Markets", "/markets", ChartCandlestick] as const
        : ["Settings", "/settings", Settings] as const;
      return <button key={k} className={`icon-btn ${k === "markets" ? "tint" : ""}`} aria-label={label} onClick={() => navigate(to)}><Icon size={20} strokeWidth={1.75} /></button>;
    })}
  </div>;
}
