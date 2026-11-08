"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

/** Last good response per key, so returning to a tab paints instantly while it refreshes. */
const cache = new Map<string, unknown>();
const listeners = new Set<() => void>();

/** Ask every mounted screen to refetch (pull to refresh, after a confirm or a buy). */
export function refreshAll() { cache.clear(); listeners.forEach(l => l()); }
export function clearApiCache() { cache.clear(); }

export function useApi<T>(key: string | null, load: () => Promise<T>, opts: { pollMs?: number } = {}) {
  const [data, setData] = useState<T | undefined>(() => (key ? (cache.get(key) as T | undefined) : undefined));
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!key && !cache.has(key));
  const loader = useRef(load); loader.current = load;

  const reload = useCallback(async () => {
    if (!key) return;
    try {
      const v = await loader.current();
      cache.set(key, v); setData(v); setError(null);
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
