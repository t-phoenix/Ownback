import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { mockChain } from './lib/env.js';
import { startBuyWorker } from './lib/buy-pipeline.js';
import { startMarketsWorker } from './lib/markets/jobs.js';

const port = Number(process.env.PORT || 3001);
const app = createApp();

serve({ fetch: app.fetch, port }, () => {
  console.log(`Ownback API on http://127.0.0.1:${port} (mockChain=${mockChain()})`);
  if (!mockChain()) startBuyWorker();
  startMarketsWorker(); // public price data: runs in mock mode too, off when MARKETS_ENABLED=0

});
