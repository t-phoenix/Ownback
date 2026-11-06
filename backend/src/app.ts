import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './routes/auth.js';
import { meRulesHomeRoutes } from './routes/me-rules-home.js';
import { depositRoutes } from './routes/deposits.js';
import { purchaseRoutes } from './routes/purchases.js';
import { jarsBuysRoutes } from './routes/jars-buys.js';
import { activityRoutes } from './routes/activity.js';
import { jobRoutes } from './routes/jobs.js';

export function createApp() {
  const app = new Hono().basePath('/api');

  app.use(
    '*',
    cors({
      origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true,
    }),
  );

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
