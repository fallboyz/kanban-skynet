import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerWorkspaceTools } from './workspaces.js';
import { registerProjectTools } from './projects.js';
import { registerTaskTools } from './tasks.js';

/**
 * Create a new McpServer instance with all tools registered.
 * Stateless mode: each request gets its own server + transport.
 */
function createMcpServerWithTools(): McpServer {
  const server = new McpServer({
    name: 'kanban-skynet',
    version: '1.0.0',
  });
  registerWorkspaceTools(server);
  registerProjectTools(server);
  registerTaskTools(server);
  return server;
}

// --- CORS ---

function setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (origin) {
    res.setHeader('Vary', 'Origin');
  }
}

// --- Request handler ---

/**
 * Handle MCP Streamable HTTP requests on a single endpoint (/mcp).
 *
 * Stateless mode: no session ID, no session management.
 * Each POST request creates a fresh McpServer + Transport pair.
 * This eliminates the session expiry problem on server restart.
 */
export async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  setCorsHeaders(req, res);

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  // --- POST: Handle JSON-RPC messages ---
  if (req.method === 'POST') {
    const mcpServer = createMcpServerWithTools();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);

    // Clean up after the request is fully handled
    res.on('close', () => {
      mcpServer.close().catch(() => {});
    });
    return;
  }

  // GET (SSE) and DELETE are not supported in stateless mode
  if (req.method === 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain', Allow: 'POST, OPTIONS' }).end('SSE streams are not supported in stateless mode');
    return;
  }

  if (req.method === 'DELETE') {
    res.writeHead(405, { 'Content-Type': 'text/plain', Allow: 'POST, OPTIONS' }).end('Session termination is not applicable in stateless mode');
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain' }).end('Method not allowed');
}
