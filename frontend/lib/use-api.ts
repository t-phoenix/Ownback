"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, wantFresh } from "./api";

/** Last good response per key, so returning to a tab paints instantly while it refreshes. */
const cache = new Map<string, unknown>();
const listeners = new Set<() => void>();

// The cache is also kept in localStorage per signed-in user, so a reload or a new visit paints
// the last screen at once and refreshes behind it. Only set for a real session (not /shots).
const STORE = "ob:api:v2:"; // v2: drops v1 caches that could hold `{}` from a cut-off response
let owner: string | null | undefined; // undefined until the session first reports
const storeKey = () => (owner ? STORE + owner : null);

function save() {
  const k = storeKey(); if (!k) return;
  try { localStorage.setItem(k, JSON.stringify(Object.fromEntries(cache))); } catch { /* full or blocked: memory only */ }
}

function wipeStore() {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith("ob:api:")) localStorage.removeItem(k); } catch { /* blocked */ }
}

/** Session calls this once it knows who is signed in; loads that user's saved screens. */
export function setCacheOwner(id: string | null) {
  if (id === owner) return;
  owner = id; cache.clear();
  const k = storeKey(); if (!k) { wipeStore(); return; } // signed out or session expired: nothing stays on the device
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith("ob:api:") && key !== k) localStorage.removeItem(key); // another user's
    const saved = JSON.parse(localStorage.getItem(k) || "{}") as Record<string, unknown>;
    for (const [key, v] of Object.entries(saved)) cache.set(key, v);
  } catch { /* corrupt or blocked: start empty */ }
}

/** Ask every mounted screen to refetch (pull to refresh, after a confirm or a buy). Skips server caches. */
export function refreshAll() { cache.clear(); wantFresh(); listeners.forEach(l => l()); }
/** Sign-in / sign-out: forget everything, on this device too. */
export function clearApiCache() { cache.clear(); owner = null; wipeStore(); }

/** Warm the cache for a screen the user is likely to open next (Markets row hover). Never throws. */
const prefetching = new Set<string>();
export function prefetchApi<T>(key: string, load: () => Promise<T>) {
  if (cache.has(key) || prefetching.has(key)) return;
  prefetching.add(key);
  load().then(v => { cache.set(key, v); }, () => {}).finally(() => prefetching.delete(key));
}

export function useApi<T>(key: string | null, load: () => Promise<T>, opts: { pollMs?: number } = {}) {
  const [data, setData] = useState<T | undefined>(() => (key ? (cache.get(key) as T | undefined) : undefined));
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!key && !cache.has(key));
  const loader = useRef(load); loader.current = load;

  const reload = useCallback(async () => {
    if (!key) return;
    try {
      const v = await loader.current();
      cache.set(key, v); save(); setData(v); setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("UPSTREAM", 0));
    } finally { setLoading(false); }
  }, [key]);

  useEffect(() => {
    if (!key) return;
    setData(cache.get(key) as T | undefined); setLoading(!cache.has(key));
    reload();
    listeners.add(reload);
    const onFocus = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onFocus);
    const t = opts.pollMs ? setInterval(reload, opts.pollMs) : undefined;
    return () => { listeners.delete(reload); document.removeEventListener("visibilitychange", onFocus); if (t) clearInterval(t); };
  }, [key, reload, opts.pollMs]);

  return { data, error, loading, reload };
}
