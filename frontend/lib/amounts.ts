/**
 * D40 Confirm amounts: all in whole cents (bigint). Pure, so the screen stays a thin shell.
 * Locked rows keep their amount; the rest share `total - locked` by weight (largest remainder, D18).
 */
export type Cents = Record<string, bigint>;

export function spread(ids: string[], weights: Cents, totalCents: bigint, locked: Set<string>, current: Cents): Cents {
  const out: Cents = {};
  let lockedSum = 0n;
  for (const id of ids) if (locked.has(id)) { out[id] = current[id] ?? 0n; lockedSum += out[id]; }
  const free = ids.filter(id => !locked.has(id));
  const rest = totalCents > lockedSum ? totalCents - lockedSum : 0n;
  if (!free.length) return out;
  let w = free.map(id => (weights[id] ?? 0n) > 0n ? weights[id] : 0n);
  let sum = w.reduce((s, x) => s + x, 0n);
  if (sum === 0n) { w = free.map(() => 1n); sum = BigInt(free.length); }
  const base = w.map(x => (rest * x) / sum);
  let left = rest - base.reduce((s, x) => s + x, 0n);
  const order = w.map((x, i) => ({ i, r: (rest * x) % sum })).sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : a.i - b.i));
  for (const { i } of order) { if (left <= 0n) break; base[i] += 1n; left -= 1n; }
  free.forEach((id, i) => { out[id] = base[i]; });
  return out;
}

export const sumOf = (c: Cents) => Object.values(c).reduce((s, x) => s + x, 0n);

/** A "nice" number near x: one significant figure (530.55 → 500, 47.75 → 50, 8.04 → 8). */
export function roundNice(cents: bigint): bigint {
  if (cents < 100n) return cents;
  let step = 100n;
  while (step * 10n <= cents) step *= 10n;
  return ((cents + step / 2n) / step) * step;
}

/** Slider granularity: about 200–2000 stops whatever the range, never below 1¢. */
export function stepFor(maxCents: bigint): bigint {
  let step = 1n;
  while (maxCents / step > 2000n) step *= 10n;
  return step;
}

/** "12.5" / "$1,234.5" → cents; null when not a valid amount. */
export function parseDollars(s: string): bigint | null {
  const t = s.trim().replace(/[$,\s]/g, "");
  if (t === "") return 0n;
  if (!/^\d{0,9}(\.\d{0,2})?$/.test(t) || t === ".") return null;
  const [w, f = ""] = t.split(".");
  return BigInt(w || "0") * 100n + BigInt((f + "00").slice(0, 2));
}
