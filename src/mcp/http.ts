import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ContainerServices } from '../container.js';
import { createMcpServer } from './server.js';

/**
 * Mounts the MCP server onto a Fastify instance using the Streamable HTTP
 * transport (POST /mcp for JSON-RPC, GET /mcp for the SSE stream, DELETE /mcp
 * to end a session). Sessions are keyed by the `Mcp-Session-Id` header, and
 * each session gets a fresh `McpServer` bound to the shared container.
 *
 * Tool auth is per-call: every tool (except `authenticate`) accepts a
 * `sessionToken` obtained from `authenticate`, so the HTTP endpoint itself is
 * stateless and needs no extra bearer tokens/OAuth.
 */

interface McpSession {
  transport: StreamableHTTPServerTransport;
  server: ReturnType<typeof createMcpServer>;
  lastActive: number;
}

const SESSION_TTL_MS = 30 * 60 * 1000;

export function registerMcpRoutes(fastify: FastifyInstance, services: ContainerServices): void {
  const sessions = new Map<string, McpSession>();

  const sweepExpired = () => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.lastActive > SESSION_TTL_MS) {
        session.transport.close().catch(() => {});
        sessions.delete(id);
      }
    }
  };

  fastify.route({
    method: ['POST', 'GET', 'DELETE'],
    url: '/mcp',
    handler: async (request, reply) => {
      // The SDK's transport writes directly to the raw Node response; hijack
      // so Fastify does not also send a reply.
      reply.hijack();

      const header = request.headers['mcp-session-id'];
      const sessionId = Array.isArray(header) ? header[0] : header;

      try {
        if (request.method === 'DELETE') {
          if (sessionId) {
            const session = sessions.get(sessionId);
            if (session) {
              sessions.delete(sessionId);
              void session.transport.close();
            }
          }
          reply.raw.statusCode = 200;
          reply.raw.end(JSON.stringify({ ok: true }));
          return;
        }

        let session = sessionId ? sessions.get(sessionId) : undefined;

        if (!session) {
          // New session (or unknown/stale id). Create the transport + server.
          const server = createMcpServer(services);
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });
          session = { transport, server, lastActive: Date.now() };
          // Connect before handling so the transport can emit messages, but
          // register the session in the map only AFTER handleRequest mints the
          // session id (initialize assignment happens inside handleRequest).
          // Registering too early stores it under `undefined` and the next
          // request with the real Mcp-Session-Id header misses the map.
          await server.connect(transport);
        } else {
          session.lastActive = Date.now();
        }

        await session.transport.handleRequest(request.raw, reply.raw, request.body);

        // Mint the session id after handling so this session is discoverable
        // on subsequent requests carrying the Mcp-Session-Id header.
        const sid = session.transport.sessionId;
        if (sid && !sessions.has(sid)) sessions.set(sid, session);
        sweepExpired();
      } catch (error) {
        request.log?.error?.(error, 'MCP request failed');
        if (!reply.raw.headersSent) {
          reply.raw.statusCode = 500;
          reply.raw.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32603, message: 'Internal server error' },
              id: null,
            }),
          );
        }
      }
    },
  });
}
