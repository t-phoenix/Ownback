import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { mockChain } from './lib/env.js';
import { startBuyWorker } from './lib/buy-pipeline.js';

const port = Number(process.env.PORT || 3001);
const app = createApp();

serve({ fetch: app.fetch, port }, () => {
  console.log(`Ownback API on http://127.0.0.1:${port} (mockChain=${mockChain()})`);
  if (!mockChain()) startBuyWorker();
});
