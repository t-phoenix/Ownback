import { getSql } from '../db/client.js';

/**
 * FX without floats. Rates are "local units per 1 USD" with up to 8 decimals,
 * held as bigint scaled by 1e8. Amounts are decimal strings ("79900.00").
 */
const RATE_SCALE = 100_000_000n;

/** "79900.5" → 7990050n (cents). Throws on anything that isn't a plain decimal. */
export function decimalToCents(s: string): bigint {
  const m = s.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) throw new Error(`bad_decimal:${s}`);
  return BigInt(m[1]!) * 100n + BigInt((m[2] ?? '').padEnd(2, '0') || '0');
}

export function rateToScaled(rate: string): bigint {
  const m = rate.trim().match(/^(\d+)(?:\.(\d{1,8}))?/);
  if (!m) throw new Error(`bad_rate:${rate}`);
  return BigInt(m[1]!) * RATE_SCALE + BigInt((m[2] ?? '').padEnd(8, '0'));
}

/** local cents ÷ (local per $) → micro-USDC, half-up. */
export function localCentsToUsd6(localCents: bigint, rateScaled: bigint): bigint {
  // usd6 = cents/100 / (rate/1e8) * 1e6 = cents * 1e4 * 1e8 / rateScaled
  const num = localCents * 10_000n * RATE_SCALE;
  return (num + rateScaled / 2n) / rateScaled;
}

/** Latest cached rate for a currency, fetching from frankfurter.app (ECB) when the cache is older than a day. */
export async function usdRate(currency: string): Promise<{ rate: string; source: string; date: string }> {
  const ccy = currency.toUpperCase();
  if (ccy === 'USD') return { rate: '1', source: 'identity', date: new Date().toISOString().slice(0, 10) };
  const sql = getSql();
  const cached = await sql<{ rate: string; source: string; date: string }[]>`
    SELECT rate::text, source, date::text FROM fx_rates
    WHERE currency = ${ccy} AND date >= CURRENT_DATE - 1
    ORDER BY date DESC LIMIT 1
  `;
  if (cached[0]) return cached[0];
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${encodeURIComponent(ccy)}`, { signal: AbortSignal.timeout(5000) });
    const body = (await res.json()) as { date?: string; rates?: Record<string, number> };
    const r = body.rates?.[ccy];
    if (!res.ok || r == null || !body.date) throw new Error('fx_unavailable');
    // The API returns a JSON number; format it once to a fixed 8-decimal string and keep strings from here on.
    const rate = r.toFixed(8);
    await sql`
      INSERT INTO fx_rates (date, currency, rate, source, fetched_at)
      VALUES (${body.date}, ${ccy}, ${rate}, 'frankfurter', now())
      ON CONFLICT (date, currency) DO UPDATE SET rate = EXCLUDED.rate, fetched_at = now()
    `;
    return { rate, source: 'frankfurter', date: body.date };
  } catch {
    const stale = await sql<{ rate: string; source: string; date: string }[]>`
      SELECT rate::text, source, date::text FROM fx_rates WHERE currency = ${ccy} ORDER BY date DESC LIMIT 1
    `;
    if (stale[0]) return { ...stale[0], source: `${stale[0].source}:stale` };
    throw new Error('fx_unavailable');
  }
}
