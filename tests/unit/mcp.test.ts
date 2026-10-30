import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createTestContainer } from '../helpers.js';
import { createMcpServer } from '../../src/mcp/server.js';

const PASSWORD = 'Correct-Horse-42!';

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Parse the text block of a tool result. `any` is intentional: assertions
 * validate the shape; strict typing here would just repeat the JSON schema.
 */
function text(result: ToolResult): any {
  const block = result.content.find((c) => c.type === 'text');
  if (!block) return null;
  try {
    return JSON.parse(block.text);
  } catch {
    // Thrown tool errors (e.g. requireUser/requireAdmin) come back as plain
    // text; keep them as strings so assertions can read the message.
    return block.text;
  }
}

async function setup() {
  const { container } = createTestContainer();
  const identity = container.services.identity;

  // Admin + regular user (both verified).
  const admin = identity.createVerifiedUser({
    name: 'Site Admin',
    email: 'admin@example.com',
    password: PASSWORD,
    role: 'admin',
  });
  const alice = identity.createVerifiedUser({
    name: 'Alice',
    email: 'alice@example.com',
    password: PASSWORD,
  });
  const bob = identity.createVerifiedUser({
    name: 'Bob',
    email: 'bob@example.com',
    password: PASSWORD,
  });

  const server = createMcpServer(container.services);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  // Server must attach first: the in-memory pair queues the client's initialize
  // until the server side has an onmessage handler.
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const call = async (
    arg: string,
    name: string,
    params: Record<string, unknown>,
  ): Promise<ToolResult> => client.callTool({ name, arguments: params }) as Promise<ToolResult>;

  return { container, client, call, admin, alice, bob };
}

test('MCP: authenticate issues a session token; tools without auth are rejected', async () => {
  const { client, call, alice } = await setup();

  // Wrong password.
  const bad = await call('bad', 'authenticate', { email: alice.email, password: 'wrong-pass-1!' });
  assert.equal(text(bad).ok, false);

  // Good login returns token + user.
  const good = await call('good', 'authenticate', { email: alice.email, password: PASSWORD });
  const session = text(good) as { ok: boolean; sessionToken: string; user: { email: string } };
  assert.equal(session.ok, true);
  assert.ok(session.sessionToken);
  assert.equal(session.user.email, alice.email);

  // Missing token → rejected.
  const me = await call('me', 'me', { sessionToken: 'bogus' });
  assert.match(String(text(me).reason ?? text(me)), /Not authenticated/);

  // Valid token → me works.
  const meOk = await call('me-ok', 'me', { sessionToken: session.sessionToken });
  assert.equal(text(meOk).user.email, alice.email);

  await client.close();
});

test('MCP: directory, profiles, and friendship lifecycle', async () => {
  const { client, call, alice, bob } = await setup();
  const session = await call('auth', 'authenticate', { email: alice.email, password: PASSWORD });
  const { sessionToken } = text(session) as { sessionToken: string };

  // Directory lists all three users.
  const list = await call('list', 'list_users', { sessionToken });
  const directory = text(list) as { total: number; users: Array<{ email: string }> };
  assert.equal(directory.total, 3);

  // Initially no relationship.
  const profileBefore = await call('profile', 'get_profile', { sessionToken, userId: bob.id });
  assert.equal(text(profileBefore).relationship, 'none');

  // Send request, accept from Bob's side, confirm friends.
  await call('req', 'send_friend_request', { sessionToken, userId: bob.id });
  const bobSession = await call('auth2', 'authenticate', { email: bob.email, password: PASSWORD });
  const bobToken = text(bobSession).sessionToken;
  await call('accept', 'accept_friend_request', { sessionToken: bobToken, userId: alice.id });

  const profileAfter = await call('profile2', 'get_profile', { sessionToken, userId: bob.id });
  assert.equal(text(profileAfter).relationship, 'friends');

  // Unfriend.
  await call('unfriend', 'remove_friend', { sessionToken, userId: bob.id });
  const profileFinal = await call('profile3', 'get_profile', { sessionToken, userId: bob.id });
  assert.equal(text(profileFinal).relationship, 'none');

  await client.close();
});

test('MCP: notifications are scoped per user; admin broadcast reaches everyone', async () => {
  const { client, call, alice, bob, admin } = await setup();

  // Alice requests Bob → Bob gets a notification.
  const aliceSession = await call('a', 'authenticate', { email: alice.email, password: PASSWORD });
  const aliceToken = text(aliceSession).sessionToken;
  await call('req', 'send_friend_request', { sessionToken: aliceToken, userId: bob.id });

  const bobSession = await call('b', 'authenticate', { email: bob.email, password: PASSWORD });
  const bobToken = text(bobSession).sessionToken;
  const bobNotifs = await call('notifs', 'list_notifications', { sessionToken: bobToken });
  const items = text(bobNotifs).items as Array<{ type: string }>;
  assert.ok(items.some((n) => n.type === 'friend-request'));

  // Non-admin cannot broadcast.
  const denied = await call('deny', 'admin_broadcast', { sessionToken: aliceToken, message: 'hi' });
  const deniedText = text(denied);
  assert.match(String(deniedText.reason ?? deniedText), /admin role/);

  // Admin broadcast reaches all.
  const adminSession = await call('adm', 'authenticate', {
    email: admin.email,
    password: PASSWORD,
  });
  const adminToken = text(adminSession).sessionToken;
  const sent = await call('send', 'admin_broadcast', {
    sessionToken: adminToken,
    message: 'Notice for everyone',
  });
  assert.equal(text(sent).recipients, 3);

  const bobNotifs2 = await call('notifs2', 'list_notifications', { sessionToken: bobToken });
  const items2 = text(bobNotifs2).items as Array<{ type: string; payload: { message?: string } }>;
  assert.ok(items2.some((n) => n.type === 'system' && n.payload.message === 'Notice for everyone'));

  await client.close();
});

test('MCP: admin tools enforce role + last-admin guard', async () => {
  const { client, call, alice, admin } = await setup();
  const aliceSession = await call('a', 'authenticate', { email: alice.email, password: PASSWORD });
  const aliceToken = text(aliceSession).sessionToken;

  // Non-admin blocked from user management.
  const denied = await call('deny', 'admin_list_users', { sessionToken: aliceToken });
  const deniedText = text(denied);
  assert.match(String(deniedText.reason ?? deniedText), /admin role/);

  const adminSession = await call('adm', 'authenticate', {
    email: admin.email,
    password: PASSWORD,
  });
  const adminToken = text(adminSession).sessionToken;

  // Admin promotes Alice, then demotes back.
  const promoted = await call('promote', 'admin_change_role', {
    sessionToken: adminToken,
    userId: alice.id,
    role: 'admin',
  });
  assert.equal(text(promoted).user.role, 'admin');
  const demoted = await call('demote', 'admin_change_role', {
    sessionToken: adminToken,
    userId: alice.id,
    role: 'user',
  });
  assert.equal(text(demoted).user.role, 'user');

  // Admin cannot demote/delete self (own account / last admin guard).
  const selfDemote = await call('self', 'admin_change_role', {
    sessionToken: adminToken,
    userId: admin.id,
    role: 'user',
  });
  assert.match(text(selfDemote).reason, /cannot change your own role/);

  await client.close();
});
