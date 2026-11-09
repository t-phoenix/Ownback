"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, Check, ChevronsRight } from "lucide-react";
import type { Tone } from "../lib/assets";
import { fmtUsd6, splitUsd } from "../lib/money";

/* ───────────────────────── Feel ───────────────────────── */

/** Light haptic tick where the platform allows it (Android Chrome). Silent elsewhere. */
export function haptic(pattern: number | number[] = 8) {
  try { if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern); } catch { /* ignore */ }
}

export function useMedia(query: string, fallback = false) {
  const [match, setMatch] = useState(fallback);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setMatch(m.matches);
    on(); m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

export const useCoarse = () => useMedia("(pointer: coarse)");
export const useReducedMotion = () => useMedia("(prefers-reduced-motion: reduce)");

/* ───────────────────────── Identity ───────────────────────── */

export function Monogram({ name, tone, size = 44, children }: { name?: string; tone: Tone; size?: number; children?: ReactNode }) {
  return <span className={`mono-tile tone-${tone}`} style={{ "--size": `${size}px` } as CSSProperties} aria-hidden="true">
    {children ?? (name ?? "").replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase()}
  </span>;
}

/** "$234" in display weight, ".20" set lighter: reads like a ledger, not a calculator. */
export function Money({ cents, className = "" }: { cents: bigint; className?: string }) {
  const [whole, frac] = splitUsd(cents);
  return <span className={`money ${className}`}><span>{whole}</span><span className="money-frac">{frac}</span></span>;
}

/**
 * Live price of ONE token (one share for xStocks). Set as a quiet ticker tag — mono, outlined, with a
 * live dot — so it never reads like a balance or an amount you hold.
 */
export function PriceTag({ token, usd6, className = "" }: { token?: string; usd6?: string; className?: string }) {
  if (!token || !usd6 || usd6 === "0") return null;
  return <span className={`price-tag ${className}`} title={`Live price of 1 ${token}`}>
    <span className="price-unit">1 {token}</span><span className="price-val">{fmtUsd6(usd6)}</span>
  </span>;
}

/** "0.00123" of a share → "≈ 1/811 of a share". Display only (never money maths). */
export function shareFraction(qty?: string): string | null {
  const n = Number(qty);
  if (!qty || !(n > 0)) return null;
  if (n >= 1) return `${n >= 10 ? Math.round(n) : n.toFixed(2).replace(/\.?0+$/, "")} share${n === 1 ? "" : "s"}`;
  return `≈ 1/${Math.round(1 / n).toLocaleString()} of a share`;
}

/** Counts up once on mount, in whole cents. */
export function CountUp({ cents, className = "", duration = 1100 }: { cents: bigint; className?: string; duration?: number }) {
  const reduced = useReducedMotion();
  const target = Number(cents);
  const [v, setV] = useState(target);
  useEffect(() => {
    if (reduced) { setV(target); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(2, -10 * p);
      setV(Math.round(target * (p === 1 ? 1 : e)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced]);
  return <Money cents={BigInt(v)} className={className} />;
}

/* ───────────────────────── Depth ───────────────────────── */

/**
 * Parallax tilt. Follows the pointer on desktop and the phone's tilt on Android.
 * Writes --rx / --ry on the element; CSS does the rest.
 */
export function Tilt({ children, className = "", strength = 10 }: { children: ReactNode; className?: string; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current; if (!el || reduced) return;
    let raf = 0;
    const set = (x: number, y: number) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { el.style.setProperty("--rx", `${(-y * strength).toFixed(2)}deg`); el.style.setProperty("--ry", `${(x * strength).toFixed(2)}deg`); });
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 1.2)));
      const y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 1.2)));
      set(x, y);
    };
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      set(Math.max(-1, Math.min(1, e.gamma / 30)), Math.max(-1, Math.min(1, (e.beta - 45) / 30)));
    };
    addEventListener("pointermove", onMove);
    addEventListener("deviceorientation", onOrient);
    return () => { removeEventListener("pointermove", onMove); removeEventListener("deviceorientation", onOrient); cancelAnimationFrame(raf); };
  }, [reduced, strength]);
  return <div ref={ref} className={`tilt ${className}`}><div className="tilt-inner">{children}</div></div>;
}

/** A pre-rendered brand object, feathered into whatever dark surface it sits on. */
export function Creative({ name, alt = "", className = "", priority = false }: { name: "coin" | "jar" | "receipt" | "shelf"; alt?: string; className?: string; priority?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`creative creative-${name} ${className}`} src={`/creatives/${name}.webp`} alt={alt} aria-hidden={alt ? undefined : true} draggable={false} decoding="async" loading={priority ? "eager" : "lazy"} />;
}

const BODY = "M32 8a24 24 0 1 0 24 24H32z";
const SLICE = "M32 8a24 24 0 0 1 24 24H32z";

/** The Slice mark as a real object: stacked layers give it thickness; the gold quarter lifts and settles. */
export function Coin3D({ size = 120, still = false }: { size?: number; still?: boolean }) {
  const id = useId().replace(/:/g, "");
  const layers = 9;
  const depth = Math.max(0.6, size / 110);
  const stack = (d: string, top: string, side: string) => Array.from({ length: layers }, (_, i) => (
    <svg key={i} viewBox="0 0 64 64" className="coin3d-layer" style={{ transform: `translateZ(${((i - layers) * depth).toFixed(2)}px)` }}>
      <path d={d} fill={i === layers - 1 ? `url(#${top})` : side} />
    </svg>
  ));
  return <div className={`coin3d ${still ? "still" : ""}`} style={{ "--s": `${size}px` } as CSSProperties} aria-hidden="true">
    <svg width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1FA36B" /><stop offset=".55" stopColor="#0F7B4F" /><stop offset="1" stopColor="#0A5C3A" /></linearGradient>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F7D77E" /><stop offset=".5" stopColor="#E9B949" /><stop offset="1" stopColor="#B98A22" /></linearGradient>
      </defs>
    </svg>
    <div className="coin3d-rig">
      <div className="coin3d-body">{stack(BODY, `${id}g`, "#085133")}</div>
      <div className="coin3d-slice">{stack(SLICE, `${id}a`, "#9C7317")}</div>
    </div>
    <div className="coin3d-shadow" />
  </div>;
}

/** A glass jar that fills with gold. `pct` is 0–100 of the $5 reminder threshold. */
export function GlassJar({ pct, ready, size = 96 }: { pct: number; ready?: boolean; size?: number }) {
  const id = useId().replace(/:/g, "");
  const level = Math.max(0, Math.min(100, pct));
  const top = 118 - (level / 100) * 84;
  return <svg className={`glass-jar ${ready ? "ready" : ""}`} viewBox="0 0 100 130" width={size} height={size * 1.3} aria-hidden="true">
    <defs>
      <clipPath id={`${id}c`}><rect x="14" y="30" width="72" height="92" rx="16" /></clipPath>
      <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#EFBE45" /><stop offset="1" stopColor="#B07F1A" /></linearGradient>
      <linearGradient id={`${id}l`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1C9A64" /><stop offset="1" stopColor="#0B5E3C" /></linearGradient>
    </defs>
    <rect className="jar-glass" x="12" y="28" width="76" height="96" rx="18" />
    <g clipPath={`url(#${id}c)`}>
      <g className="jar-fill" style={{ transform: `translateY(${top}px)` }}>
        <path className="jar-wave" d="M-60 6 q15 -6 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V140 H-60 Z" fill={`url(#${id}f)`} />
      </g>
    </g>
    <path className="jar-shine" d="M24 42 v58" strokeLinecap="round" />
    <path className="jar-shine thin" d="M31 46 v20" strokeLinecap="round" />
    <rect x="18" y="12" width="64" height="18" rx="7" fill={`url(#${id}l)`} />
    <rect x="22" y="14" width="40" height="3" rx="1.5" fill="#ffffff" opacity=".22" />
  </svg>;
}

/** Thin progress ring. `value` is 0–100. */
export function Ring({ value, size = 44, stroke = 4, children, label }: { value: number; size?: number; stroke?: number; children?: ReactNode; label?: string }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  return <span className="ring" style={{ width: size, height: size }} role={label ? "img" : undefined} aria-label={label}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-value" strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, value)) / 100)} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
    {children && <span className="ring-center">{children}</span>}
  </span>;
}

/* ───────────────────────── Gestures ───────────────────────── */

/**
 * Slide to confirm, for the two irreversible moments (confirm a purchase, approve a buy).
 * A slide can't happen by accident in a pocket; a tap only nudges. Enter / Space confirm for keyboards.
 */
export function SwipeToConfirm({ label, onConfirm, disabled }: { label: string; onConfirm: () => void; disabled?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const startX = useRef(0); const moved = useRef(false); const half = useRef(false);
  const [x, setX] = useState(0); const [drag, setDrag] = useState(false); const [done, setDone] = useState(false); const [nudge, setNudge] = useState(false);
  const max = () => (track.current ? track.current.clientWidth - 60 : 240);
  const finish = useCallback(() => { setDone(true); setX(max()); haptic([12, 40, 18]); setTimeout(onConfirm, 320); }, [onConfirm]);
  return <div ref={track} className={`slide-confirm ${drag ? "dragging" : ""} ${done ? "done" : ""} ${nudge ? "nudge" : ""}`} aria-disabled={disabled}>
    <span className="slide-fill" style={{ width: x + 56 }} />
    <span className="slide-label" style={{ opacity: Math.max(0, 1 - x / (max() * 0.7)) }}>{label}<ChevronsRight size={18} className="slide-chev" /></span>
    <button type="button" className="slide-knob" aria-label={`${label}. Slide right, or press Enter`} disabled={disabled || done}
      style={{ transform: `translateX(${x}px)` }}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); finish(); } }}
      onPointerDown={e => { if (done) return; (e.target as HTMLElement).setPointerCapture(e.pointerId); startX.current = e.clientX - x; moved.current = false; half.current = false; setDrag(true); }}
      onPointerMove={e => {
        if (!drag) return; const nx = Math.max(0, Math.min(max(), e.clientX - startX.current));
        if (Math.abs(nx - x) > 2) moved.current = true;
        if (!half.current && nx > max() / 2) { half.current = true; haptic(6); }
        setX(nx);
      }}
      onPointerUp={() => {
        setDrag(false);
        if (x > max() * 0.86) finish();
        else { setX(0); if (!moved.current) { setNudge(true); setTimeout(() => setNudge(false), 600); } }
      }}
      onPointerCancel={() => { setDrag(false); setX(0); }}>
      {done ? <Check size={22} strokeWidth={2.6} /> : <ArrowRight size={22} strokeWidth={2.2} />}
    </button>
  </div>;
}

/** Touch gets the slide; mouse and keyboard get an honest button. */
export function ConfirmAction({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const coarse = useCoarse();
  if (coarse) return <SwipeToConfirm label={label} onConfirm={onConfirm} />;
  return <button className="button primary full lg" onClick={() => { haptic(10); onConfirm(); }}>{label} <ArrowRight size={18} /></button>;
}

/** Bottom sheet on phones, centred dialog on desktop. Drag the handle down, tap outside or press Esc to close. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const [dy, setDy] = useState(0); const start = useRef<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k); panel.current?.focus();
    return () => removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return <div className="sheet-scrim" onClick={onClose}>
    <div ref={panel} className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} style={{ transform: dy ? `translateY(${dy}px)` : undefined }} onClick={e => e.stopPropagation()}>
      <div className="sheet-grab"
        onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); start.current = e.clientY; }}
        onPointerMove={e => { if (start.current != null) setDy(Math.max(0, e.clientY - start.current)); }}
        onPointerUp={() => { if (dy > 90) { haptic(6); onClose(); } setDy(0); start.current = null; }}>
        <span />
      </div>
      <h2 className="sheet-title">{title}</h2>
      {children}
    </div>
  </div>;
}

type DeckItem = { id: string; title: string; body: string; cta: string; icon: ReactNode; meta?: string };

/**
 * The "waiting for you" stack. Swipe right to act, left to put it at the back.
 * Buttons do the same for anyone not using gestures.
 */
export function SwipeDeck({ items, onAct, empty }: { items: DeckItem[]; onAct: (item: DeckItem) => void; empty: ReactNode }) {
  const [order, setOrder] = useState(items);
  const [dx, setDx] = useState(0); const [fly, setFly] = useState<0 | 1 | -1>(0);
  const start = useRef<{ x: number; y: number } | null>(null); const locked = useRef<"x" | "y" | null>(null);
  useEffect(() => setOrder(items), [items]);
  const later = () => { haptic(6); setFly(-1); setTimeout(() => { setOrder(o => [...o.slice(1), o[0]]); setFly(0); setDx(0); }, 220); };
  const act = (item: DeckItem) => { haptic(10); setFly(1); setTimeout(() => { setFly(0); setDx(0); onAct(item); }, 220); };
  if (!order.length) return <>{empty}</>;
  return <div className="deck" data-noswipe aria-roledescription="stack" aria-label={`${order.length} waiting for you`}>
    {order.slice(0, 3).map((item, i) => {
      const top = i === 0;
      const tx = top ? (fly ? fly * 520 : dx) : 0;
      const style = { "--i": i, transform: top ? `translateX(${tx}px) rotate(${tx / 28}deg)` : undefined, transition: top && start.current ? "none" : undefined } as CSSProperties;
      return <article key={item.id} className={`deck-card ${top ? "top" : ""}`} style={style} aria-hidden={!top}
        onPointerDown={top ? e => { if ((e.target as HTMLElement).closest("button")) return; start.current = { x: e.clientX, y: e.clientY }; locked.current = null; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } : undefined}
        onPointerMove={top ? e => {
          if (!start.current) return;
          const mx = e.clientX - start.current.x, my = e.clientY - start.current.y;
          if (!locked.current && (Math.abs(mx) > 8 || Math.abs(my) > 8)) locked.current = Math.abs(mx) > Math.abs(my) ? "x" : "y";
          if (locked.current === "x") setDx(mx);
        } : undefined}
        onPointerUp={top ? () => { const d = dx; start.current = null; if (d > 110) act(item); else if (d < -110) later(); else setDx(0); } : undefined}
        onPointerCancel={top ? () => { start.current = null; setDx(0); } : undefined}>
        <div className="deck-stamp do" style={{ opacity: top ? Math.max(0, Math.min(1, dx / 110)) : 0 }}>{item.cta}</div>
        <div className="deck-stamp later" style={{ opacity: top ? Math.max(0, Math.min(1, -dx / 110)) : 0 }}>Later</div>
        <div className="deck-head"><span className="deck-icon">{item.icon}</span>{item.meta && <span className="deck-meta">{item.meta}</span>}</div>
        <h3 className="deck-title">{item.title}</h3>
        <p className="deck-body">{item.body}</p>
        <div className="deck-actions">
          <button className="button quiet sm" tabIndex={top ? 0 : -1} onClick={later}>Later</button>
          <button className="button primary sm" tabIndex={top ? 0 : -1} onClick={() => act(item)}>{item.cta} <ArrowRight size={16} /></button>
        </div>
      </article>;
    })}
    <p className="deck-hint" aria-hidden="true">{order.length > 1 ? `1 of ${order.length} · swipe to sort` : "Last one"}</p>
  </div>;
}

/** Live countdown in seconds that loops, e.g. quote refresh. */
export function useCountdown(from: number) {
  const [s, setS] = useState(from);
  useEffect(() => { const t = setInterval(() => setS(v => (v <= 1 ? from : v - 1)), 1000); return () => clearInterval(t); }, [from]);
  return s;
}
