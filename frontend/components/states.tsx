"use client";

import type { ReactNode } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { errorCopy } from "../lib/copy";
import type { ApiError } from "../lib/api";

export function Skeleton({ h = 66, r = 20, mt = 0 }: { h?: number; r?: number; mt?: number }) {
  return <div className="skeleton" style={{ height: h, borderRadius: r, marginTop: mt }} aria-hidden="true" />;
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return <div className="card list" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div key={i} className="row"><span className="skeleton" style={{ width: 44, height: 44, borderRadius: 14 }} /><span className="row-main"><span className="skeleton" style={{ width: "55%", height: 14 }} /><span className="skeleton" style={{ width: "35%", height: 12, marginTop: 8 }} /></span></div>)}</div>;
}

export function ErrorState({ error, onRetry }: { error: ApiError | null; onRetry?: () => void }) {
  if (!error) return null;
  const offline = error.code === "OFFLINE";
  return <div className="error-state" role="alert">
    {offline ? <WifiOff size={18} /> : null}
    <span>{errorCopy(error.code)}</span>
    {onRetry && <button className="button quiet sm" onClick={onRetry}><RefreshCw size={14} /> Try again</button>}
  </div>;
}

export function Empty({ title, body, children, art }: { title: string; body?: string; children?: ReactNode; art?: ReactNode }) {
  return <div className="empty-state">{art}<strong>{title}</strong>{body && <p>{body}</p>}{children}</div>;
}
