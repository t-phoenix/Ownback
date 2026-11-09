/** Whole-token decimal string → raw units. Extra digits past `decimals` are truncated (Postgres numeric pads zeros). */
export function qtyToRaw(qty: string, decimals: number): bigint | null {
  const t = qty.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [w, f = ''] = t.split('.');
  return BigInt(w) * 10n ** BigInt(decimals) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals) || '0');
}
