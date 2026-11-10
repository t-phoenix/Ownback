/**
 * Markets background work (runs in the API process, like the buy worker):
 * - keep every listed price warm in the shared Jupiter cache (one batch of 50 at a time),
 * - write a price tick per hot-set asset every 5 min (idempotent across instances),
 * - drop ticks older than 8 days.
 */
import { getSql } from '../../db/client.js';
import { envFlag } from '../env.js';
import { jupiterPricesUsd6 } from '../jupiter-price.js';
import { TICK_EVERY_MS, TICK_KEEP_MS } from '../../shared/markets.js';
import { marketAssets } from './catalog.js';
import { hotSet, writeTicks } from './prices.js';

export const marketsEnabled = () => envFlag('MARKETS_ENABLED', process.env.NODE_ENV !== 'production');

const WARM_EVERY_MS = 60_000;
const CHUNK = 50;

/** Fetch every listed price, one 50-id batch at a time (parallel batches trip Jupiter's 429). */
export async function warmPrices(): Promise<void> {
  const mints = marketAssets().map((a) => a.mint);
  for (let i = 0; i < mints.length; i += CHUNK) {
    await jupiterPricesUsd6(mints.slice(i, i + CHUNK)).catch(() => null);
    await new Promise((r) => setTimeout(r, 250));
  }
}

let started = false;
export function startMarketsWorker(): void {
  if (started || !marketsEnabled()) return;
  started = true;
  let warming = false; let lastTick = 0; let lastClean = 0;
  const loop = async () => {
    if (warming) return;
    warming = true;
    try {
      await warmPrices();
      if (Date.now() - lastTick >= TICK_EVERY_MS) { lastTick = Date.now(); await writeTicks(await hotSet()).catch(() => 0); }
      if (Date.now() - lastClean >= 6 * 3_600_000) {
        lastClean = Date.now();
        await getSql()`DELETE FROM price_ticks WHERE at < ${new Date(Date.now() - TICK_KEEP_MS)}`.catch(() => {});
      }
    } finally { warming = false; }
  };
  void loop();
  setInterval(loop, WARM_EVERY_MS).unref();
}
