import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { createTestContainer } from '../helpers.js';
import type { Server } from 'node:http';

let app: FastifyInstance;
let container: ReturnType<typeof createTestContainer>['container'];

// MCP Streamable HTTP is content-negotiated over SSE. A client advertises both
// media types and the server replies with text/event-stream frames.
const ACCEPT = 'application/json, text/event-stream';

/** Extract the first JSON payload from an SSE `data:` frame. */
function sseJson(body: string): any {
  const data = body
    .split('\n')
    .find((line) => line.startsWith('data:'))
    ?.slice(5);
  return data ? JSON.parse(data) : undefined;
}

before(async () => {
  ({ container } = createTestContainer());
  // The transport is mounted only when configured; enable it for this suite.
  // config is a shared singleton, so flip it before buildApp registers routes.
  container.config.mcp.httpEnabled = true;
  app = await buildApp({ container });
  // The MCP route's hook context (preParsing etc.) is populated during
  // `ready()`; without it the route crashes before the handler runs.
  await app.ready();
});

after(async () => {
  container.config.mcp.httpEnabled = false;
  await app.close();
  container.close();
});

test('MCP HTTP endpoint: initialize handshake returns server info + session id', async () => {
  const res = await request(app.server as Server)
    .post('/mcp')
    .set('Accept', ACCEPT)
    .send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    })
    .expect(200);
  assert.match(res.headers['content-type'] || '', /text\/event-stream/);
  assert.ok(res.headers['mcp-session-id'], 'should mint a session id');

  const body = sseJson(res.text);
  assert.ok(body, 'should contain an SSE data frame');
  assert.equal(body.jsonrpc, '2.0');
  assert.equal(body.result.serverInfo.name, 'brainleague');
  assert.equal(body.result.protocolVersion, '2025-03-26');
});

test('MCP HTTP endpoint: tools/list exposes the auth + interaction tools', async () => {
  // Initialize to open a session, then re-use its id for tools/list.
  const init = await request(app.server as Server)
    .post('/mcp')
    .set('Accept', ACCEPT)
    .send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    })
    .expect(200);
  const sessionId = init.headers['mcp-session-id'];

  const res = await request(app.server as Server)
    .post('/mcp')
    .set('Accept', ACCEPT)
    .set('Mcp-Session-Id', sessionId)
    .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    .expect(200);

  const body = sseJson(res.text);
  const names = body.result.tools.map((t: { name: string }) => t.name);
  assert.ok(names.includes('authenticate'));
  assert.ok(names.includes('list_users'));
  assert.ok(names.includes('list_notifications'));
  assert.ok(names.includes('admin_broadcast'));
});
