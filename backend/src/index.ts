import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 3001);
const app = createApp();

serve({ fetch: app.fetch, port }, () => {
  console.log(`Ownback API on http://127.0.0.1:${port} (MOCK_CHAIN=${process.env.MOCK_CHAIN ?? '1'})`);
});
