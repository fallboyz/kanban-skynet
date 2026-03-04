import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import type { WsEvent } from './types.js';

// ============================================================
// WebSocket server management
// ============================================================

const clients = new Set<WebSocket>();

const HEARTBEAT_INTERVAL_MS = 30_000;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Initialize the WebSocket server attached to the given HTTP server.
 * Listens on the `/ws` path. Uses noServer mode so that non-/ws upgrade
 * requests (e.g. Next.js HMR) are forwarded to Next.js instead of being
 * swallowed.
 */
export function initWebSocket(
  server: HttpServer,
  nextUpgrade?: (req: import('node:http').IncomingMessage, socket: import('node:net').Socket, head: Buffer) => void,
): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const pathname = req.url?.split('?')[0] ?? '';
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else if (nextUpgrade) {
      nextUpgrade(req, socket as import('node:net').Socket, head);
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);

    // Mark as alive on connection
    (ws as WebSocket & { isAlive: boolean }).isAlive = true;

    ws.on('pong', () => {
      (ws as WebSocket & { isAlive: boolean }).isAlive = true;
    });

    ws.on('close', () => {
      clients.delete(ws);
    });

    ws.on('error', () => {
      clients.delete(ws);
    });
  });

  // Heartbeat: periodically ping clients and terminate unresponsive ones
  heartbeatTimer = setInterval(() => {
    for (const ws of clients) {
      const wsAlive = ws as WebSocket & { isAlive: boolean };
      if (!wsAlive.isAlive) {
        clients.delete(ws);
        ws.terminate();
        continue;
      }
      wsAlive.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on('close', () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  });

  return wss;
}

/**
 * Broadcast a WsEvent to all connected WebSocket clients.
 */
export function broadcast(event: WsEvent): void {
  const data = JSON.stringify(event);

  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data);
      } catch {
        clients.delete(ws);
      }
    }
  }
}
