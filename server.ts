import { createServer } from 'node:http';
import next from 'next';
import { getRequestListener } from '@hono/node-server';
import { createApiApp } from './src/server/api/index.js';
import { initWebSocket } from './src/server/ws.js';
import { handleMcpRequest } from './src/server/mcp/index.js';
import { recoverOrphanedTasks } from './src/server/db/index.js';

// ============================================================
// Initialize
// ============================================================

const dev = process.env.NODE_ENV !== 'production';
const PORT = Number(process.env.PORT) || 4000;

const nextApp = next({ dev, port: PORT });
const nextHandler = nextApp.getRequestHandler();

async function main() {
  await nextApp.prepare();

  const apiApp = createApiApp();
  const apiListener = getRequestListener(apiApp.fetch);

  // ============================================================
  // HTTP Server — routes requests to the right handler
  // ============================================================

  const server = createServer(async (req, res) => {
    const pathname = req.url?.split('?')[0] ?? '/';

    // MCP Streamable HTTP endpoint
    if (pathname === '/mcp') {
      return handleMcpRequest(req, res);
    }

    // Hono API + health check
    if (pathname.startsWith('/api/') || pathname === '/health') {
      return apiListener(req, res);
    }

    // Everything else -> Next.js
    return nextHandler(req, res);
  });

  // ============================================================
  // WebSocket — attach to the same HTTP server
  // ============================================================

  const nextUpgradeHandler = nextApp.getUpgradeHandler();
  initWebSocket(server, nextUpgradeHandler);

  // ============================================================
  // Start
  // ============================================================

  // Recover tasks stuck in in_progress from a previous crash / unclean shutdown
  const recovered = recoverOrphanedTasks();
  if (recovered.length > 0) {
    console.log(`Recovered ${recovered.length} orphaned task(s) from previous session`);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Kanban Skynet running on http://0.0.0.0:${PORT}`);
    console.log(`  Web UI:    http://localhost:${PORT}`);
    console.log(`  API:       http://localhost:${PORT}/api/`);
    console.log(`  MCP:       http://localhost:${PORT}/mcp`);
    console.log(`  WebSocket: ws://localhost:${PORT}/ws`);
  });

  // ============================================================
  // Graceful shutdown
  // ============================================================

  async function shutdown(): Promise<void> {
    console.log('Shutting down...');
    server.close();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
