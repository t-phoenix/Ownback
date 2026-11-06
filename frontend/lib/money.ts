/**
 * Display helpers for money. Amounts are whole cents as bigint (micro-USDC / 10_000n).
 * No floats touch money; animation code converts to Number only for the frame value.
 */
export const C = (dollars: number, cents = 0) => BigInt(dollars) * 100n + BigInt(cents);

export function fmtUsd(c: bigint, opts: { sign?: boolean } = {}): string {
  const neg = c < 0n;
  const abs = neg ? -c : c;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "−" : opts.sign ? "+" : ""}$${whole}.${frac}`;
}

/** Split for typographic display: "$234" and ".20". */
export function splitUsd(c: bigint): [string, string] {
  const s = fmtUsd(c);
  const i = s.lastIndexOf(".");
  return [s.slice(0, i), s.slice(i)];
}

/** Whole-number percentage (0–100) of part/whole, integer maths. */
export function pct(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  const p = (part * 100n) / whole;
  return Number(p > 100n ? 100n : p);
}

/** "6.5%": part/whole with one decimal, integer maths. */
export function pct1(part: bigint, whole: bigint): string {
  if (whole <= 0n) return "0%";
  const t = (part * 1000n) / whole;
  return `${t / 10n}.${t % 10n}%`;
}

/** rate% of an amount in cents, floored to whole cents. */
export function share(amount: bigint, ratePct: number): bigint {
  return (amount * BigInt(ratePct)) / 100n;
}
