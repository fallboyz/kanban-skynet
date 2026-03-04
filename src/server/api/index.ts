import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import workspaceRoutes from './workspaces.js';
import projectRoutes from './projects.js';
import taskRoutes from './tasks.js';

const MAX_BODY_SIZE = 1 * 1024 * 1024; // 1MB

export function createApiApp(): Hono {
  const app = new Hono();

  // CORS for all /api/* routes (reflect request origin instead of wildcard *)
  app.use('/api/*', cors({
    origin: (origin) => origin ?? '*',
  }));

  // Body size limit (prevent memory exhaustion via large payloads)
  app.use('/api/*', bodyLimit({ maxSize: MAX_BODY_SIZE }));

  // Mount route modules under /api
  app.route('/api', workspaceRoutes);
  app.route('/api', projectRoutes);
  app.route('/api', taskRoutes);

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok' }));

  return app;
}
