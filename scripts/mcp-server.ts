/**
 * MCP stdio entry point. Run with `npm run mcp` — connects the application's
 * MCP tools to stdin/stdout so any MCP-compatible client (Claude Desktop,
 * Cursor, CLI agents) can authenticate and interact with users, notifications,
 * friendships, and admin functions.
 *
 * Uses the same SQLite database as the web app (DATABASE_PATH / default
 * ./data/app.db), so agents see live production data.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildContainer } from '../src/container.js';
import { createMcpServer } from '../src/mcp/server.js';

const container = buildContainer();
const server = createMcpServer(container.services);
const transport = new StdioServerTransport();

await server.connect(transport);
console.error('MCP server (brainleague) ready on stdio.');

process.on('SIGINT', async () => {
  await server.close();
  container.close();
  process.exit(0);
});
