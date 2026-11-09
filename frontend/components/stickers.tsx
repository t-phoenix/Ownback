"use client";

/**
 * The Ownback sticker pack: die-cut SVG stickers drawn in brand colours (no image files).
 * <Sticker> makes one playful: it wiggles on hover, pops with confetti on tap, and can be
 * flicked — drag it and let go, it springs home with a spin. Locked stickers tell you how to earn them.
 */
import { useId, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as RPointerEvent, ReactNode } from "react";
import { haptic, useReducedMotion } from "./ui";

export type StickerId = "hello" | "receipt" | "jar-full" | "first-share" | "on-chain" | "trio" | "stacker" | "owner";

const G = "#0F7B4F", G2 = "#1FA36B", GOLD = "#E9B949", GOLD2 = "#B98A22", INK = "#0E2A1F", CREAM = "#FFF8E7";

/** Pie mark: green body, gold quarter lifted. */
const Pie = ({ x = 60, y = 54, r = 26 }: { x?: number; y?: number; r?: number }) => <g>
  <path d={`M${x} ${y - r}a${r} ${r} 0 1 0 ${r} ${r}H${x}z`} fill={G} />
  <path d={`M${x + 4} ${y - r - 4}a${r} ${r} 0 0 1 ${r} ${r}H${x + 4}z`} fill={GOLD} stroke={GOLD2} strokeWidth="1.5" />
</g>;

const Label = ({ text, y = 100, fill = INK }: { text: string; y?: number; fill?: string }) =>
  <text x="60" y={y} textAnchor="middle" fontFamily="Bricolage Grotesque, system-ui, sans-serif" fontWeight="800" fontSize={text.length > 13 ? 8.6 : text.length > 11 ? 10 : 11.5} letterSpacing=".3" fill={fill}>{text}</text>;

const ART: Record<StickerId, { label: string; earn: string; art: ReactNode }> = {
  hello: { label: "HELLO OWNER", earn: "Yours for signing up.", art: <><circle cx="60" cy="52" r="30" fill={CREAM} /><Pie y={54} r={22} /><path d="M86 26l6-8M92 34l9-3M80 20l1-9" stroke={GOLD2} strokeWidth="3" strokeLinecap="round" /></> },
  receipt: { label: "RECEIPT → SHARES", earn: "Add your first purchase.", art: <><path d="M36 22h34v58l-6-4-5 4-6-4-6 4-5-4-6 4z" fill="#fff" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" /><path d="M43 36h20M43 46h14M43 56h18" stroke={INK} strokeWidth="2.5" strokeLinecap="round" opacity=".5" /><circle cx="80" cy="62" r="16" fill={GOLD} stroke={GOLD2} strokeWidth="2" /><path d="M74 62h11m-4-5 5 5-5 5" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></> },
  "jar-full": { label: "JAR FULL!", earn: "Fill a jar to your capacity.", art: <><rect x="34" y="18" width="52" height="12" rx="5" fill={G} /><rect x="30" y="28" width="60" height="58" rx="14" fill="#E8F4EE" stroke={INK} strokeWidth="2.5" /><path d="M32 52q14-7 28 0t28 0v20a12 12 0 0 1-12 12H44a12 12 0 0 1-12-12z" fill={GOLD} /><path d="M40 38v34" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".8" /><path d="M94 22l4-9M100 32l9-2" stroke={GOLD2} strokeWidth="3" strokeLinecap="round" /></> },
  "first-share": { label: "MY FIRST SHARE", earn: "Buy your first piece of a company.", art: <><circle cx="60" cy="52" r="32" fill={GOLD} stroke={GOLD2} strokeWidth="3" /><circle cx="60" cy="52" r="24" fill="none" stroke={CREAM} strokeWidth="2" strokeDasharray="3 4" /><Pie y={54} r={15} /></> },
  "on-chain": { label: "PROOF ON-CHAIN", earn: "Own something with an on-chain proof.", art: <><path d="M60 18l30 11v22c0 18-13 30-30 36-17-6-30-18-30-36V29z" fill={G} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" /><path d="M46 52l10 10 18-20" stroke={CREAM} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></> },
  trio: { label: "3 COMPANIES", earn: "Own pieces of three companies.", art: <><circle cx="42" cy="58" r="17" fill={G2} stroke={INK} strokeWidth="2.5" /><circle cx="78" cy="58" r="17" fill="#8FB9A3" stroke={INK} strokeWidth="2.5" /><circle cx="60" cy="34" r="17" fill={GOLD} stroke={INK} strokeWidth="2.5" /></> },
  stacker: { label: "STACKING", earn: "Add five purchases.", art: <>{[0, 1, 2, 3].map(i => <g key={i}><ellipse cx="60" cy={78 - i * 12} rx="26" ry="9" fill={GOLD2} /><ellipse cx="60" cy={74 - i * 12} rx="26" ry="9" fill={GOLD} stroke={GOLD2} strokeWidth="1.5" /></g>)}</> },
  owner: { label: "TINY TYCOON", earn: "Own $10 of companies.", art: <><path d="M34 44l10 12 16-22 16 22 10-12-6 34H40z" fill={GOLD} stroke={GOLD2} strokeWidth="2.5" strokeLinejoin="round" /><circle cx="60" cy="30" r="5" fill={G} /><circle cx="34" cy="42" r="4" fill={G} /><circle cx="86" cy="42" r="4" fill={G} /><rect x="40" y="76" width="40" height="8" rx="3" fill={G} /></> },
};

export const STICKER_IDS = Object.keys(ART) as StickerId[];
export const stickerEarn = (id: StickerId) => ART[id].earn;
export const stickerLabel = (id: StickerId) => ART[id].label;

/** Just the artwork (for decoration). */
export function StickerArt({ id, size = 96, locked = false }: { id: StickerId; size?: number; locked?: boolean }) {
  const f = useId().replace(/:/g, "");
  const a = ART[id];
  return <svg viewBox="0 0 120 120" width={size} height={size} className={`sticker-svg ${locked ? "locked" : ""}`} aria-hidden="true">
    <defs><filter id={`${f}s`} x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity=".28" /></filter></defs>
    <g filter={`url(#${f}s)`}>
      {/* die-cut: a thick white outline around everything */}
      <rect x="8" y="8" width="104" height="104" rx="30" fill="#fff" />
      <rect x="13" y="13" width="94" height="94" rx="26" fill={CREAM} />
      {a.art}
      <rect x="14" y="88" width="92" height="18" rx="9" fill="#fff" opacity=".85" />
      <Label text={a.label} />
    </g>
  </svg>;
}

const CONFETTI = [GOLD, G2, "#D8835C", "#8FB9A3", GOLD, G];

/** One interactive sticker: hover wiggle, tap pop + confetti, drag-and-flick with spring back. */
export function Sticker({ id, size = 96, locked = false, onLocked }: { id: StickerId; size?: number; locked?: boolean; onLocked?: (earn: string) => void }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; t: number; moved: boolean } | null>(null);
  const dragged = useRef(false); // the click after a drag is not a tap
  const [burst, setBurst] = useState(0);
  const [pop, setPop] = useState(false);

  const set = (dx: number, dy: number, rot: number) => {
    const el = ref.current; if (!el) return;
    el.style.setProperty("--dx", `${dx}px`); el.style.setProperty("--dy", `${dy}px`); el.style.setProperty("--rot", `${rot}deg`);
  };
  const down = (e: RPointerEvent<HTMLButtonElement>) => {
    if (reduced) return;
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add("held");
  };
  const move = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;
    // Rubber band: follows the finger, harder the further it goes.
    set(dx * 0.6, dy * 0.6, dx * 0.15);
  };
  const up = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = drag.current; drag.current = null;
    const el = e.currentTarget; el.classList.remove("held");
    if (!d) return;
    dragged.current = d.moved;
    if (d.moved) {
      const v = (e.clientX - d.x) / Math.max(16, performance.now() - d.t);
      el.style.setProperty("--spin", `${Math.round(v * 360)}deg`);
      el.classList.remove("flung"); void el.offsetWidth; el.classList.add("flung");
      haptic(6);
    }
    set(0, 0, 0);
  };
  const tap = () => {
    if (dragged.current) { dragged.current = false; return; }
    if (locked) { haptic(4); onLocked?.(ART[id].earn); return; }
    haptic([8, 30, 8]); setPop(false); requestAnimationFrame(() => setPop(true)); setBurst(b => b + 1);
  };

  return <button ref={ref} type="button" className={`sticker ${locked ? "is-locked" : ""} ${pop ? "pop" : ""}`}
    style={{ "--sz": `${size}px` } as CSSProperties}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
    onClick={tap} onAnimationEnd={() => setPop(false)}
    aria-label={locked ? `${ART[id].label} sticker, locked. ${ART[id].earn}` : `${ART[id].label} sticker`}>
    <StickerArt id={id} size={size} locked={locked} />
    <span className="sticker-sheen" aria-hidden="true" />
    {!!burst && !reduced && <span key={burst} className="confetti" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => <i key={i} style={{ "--a": `${i * 30}deg`, "--c": CONFETTI[i % CONFETTI.length] } as CSSProperties} />)}
    </span>}
  </button>;
}

/** The sticker book: every sticker in the pack, earned ones in colour, the rest waiting. */
export function StickerBook({ earned, onLocked }: { earned: Set<StickerId>; onLocked: (earn: string) => void }) {
  return <div className="sticker-book">
    {STICKER_IDS.map(id => <Sticker key={id} id={id} size={92} locked={!earned.has(id)} onLocked={onLocked} />)}
  </div>;
}
