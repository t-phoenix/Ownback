import { Hono } from 'hono';
import { authRoutes } from './routes/auth.js';
import { meRulesHomeRoutes } from './routes/me-rules-home.js';
import { depositRoutes } from './routes/deposits.js';
import { purchaseRoutes } from './routes/purchases.js';
import { jarsBuysRoutes } from './routes/jars-buys.js';
import { activityRoutes } from './routes/activity.js';
import { jobRoutes } from './routes/jobs.js';

export function createApp() {
  const app = new Hono().basePath('/api');

  app.get('/health', (c) => c.json({ ok: true }));

  app.route('/', authRoutes);
  app.route('/', meRulesHomeRoutes);
  app.route('/', depositRoutes);
  app.route('/', purchaseRoutes);
  app.route('/', jarsBuysRoutes);
  app.route('/', activityRoutes);
  app.route('/', jobRoutes);

  return app;
}
