import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { ContainerServices } from '../container.js';
import { requireUser, requireAdmin, publicUser } from './auth.js';

/**
 * MCP server exposing this application to agents (Claude Desktop, Cursor,
 * home-grown clients, …). Tools require a `sessionToken` minted by
 * `authenticate` — the same opaque session cookie the web app uses — so every
 * agent call is scoped to a real user and honors revocation.
 *
 * Transport is injected by the caller: stdio (scripts/mcp-server.ts) or the
 * streamable HTTP transport mounted at /mcp (src/app.ts).
 */
export function createMcpServer(services: ContainerServices): McpServer {
  const { identity, directory, friendships, notifications, admin } = services;

  const server = new McpServer({
    name: 'brainleague',
    version: '1.0.0',
  });

  const done = (text: unknown) => ({
    content: [
      {
        type: 'text' as const,
        text: typeof text === 'string' ? text : JSON.stringify(text, null, 2),
      },
    ],
  });

  // ------------------------------------------------------------------ auth

  server.registerTool(
    'authenticate',
    {
      description:
        'Sign in with email + password and receive a sessionToken for subsequent tool calls.',
      inputSchema: {
        email: z.string().describe('Account email address'),
        password: z.string().describe('Account password'),
      },
    },
    async ({ email, password }) => {
      const result = await identity.login({ email, password }, { ip: 'mcp' });
      if (!result.ok) return done({ ok: false, reason: result.reason });
      const session = identity.createSession(result.userId);
      const user = identity.currentUser(session.token)!;
      return done({
        ok: true,
        sessionToken: session.token,
        expiration: session.expiresAt,
        user: publicUser(user),
      });
    },
  );

  server.registerTool(
    'logout',
    {
      description: 'Destroy a session token, signing that session out.',
      inputSchema: { sessionToken: z.string().describe('Token from authenticate') },
    },
    async ({ sessionToken }) => done({ ok: identity.destroySession(sessionToken) }),
  );

  server.registerTool(
    'me',
    {
      description: 'Return the authenticated user and their unread notification count.',
      inputSchema: { sessionToken: z.string().describe('Token from authenticate') },
    },
    async ({ sessionToken }) => {
      const authed = requireUser(identity, sessionToken);
      return done({
        user: publicUser(authed),
        unreadNotifications: notifications.unreadCount(authed.id),
        incomingFriendRequests: friendships.incomingCount(authed.id),
      });
    },
  );

  // ----------------------------------------------------------------- users

  server.registerTool(
    'list_users',
    {
      description: 'List users in the directory (paginated, optional search query).',
      inputSchema: {
        sessionToken: z.string().describe('Token from authenticate'),
        query: z.string().optional().describe('Search by name or email'),
        page: z.number().int().positive().optional().describe('Page number, defaults to 1'),
        perPage: z
          .number()
          .int()
          .positive()
          .max(50)
          .optional()
          .describe('Rows per page, defaults to 20'),
      },
    },
    async ({ sessionToken, query, page, perPage }) => {
      requireUser(identity, sessionToken);
      const directoryResult = directory.listUsers({
        query: query ?? '',
        page: page ?? 1,
        perPage: perPage ?? 20,
      });
      return done(directoryResult);
    },
  );

  server.registerTool(
    'get_profile',
    {
      description:
        'View a user profile: public info, friendship state with the viewer, and friend list.',
      inputSchema: {
        sessionToken: z.string().describe('Token from authenticate'),
        userId: z.string().describe('Target user id'),
      },
    },
    async ({ sessionToken, userId }) => {
      const authed = requireUser(identity, sessionToken);
      const profile = directory.getProfile(authed.id, userId);
      return profile ? done(profile) : done({ ok: false, reason: 'User not found.' });
    },
  );

  // ------------------------------------------------------------- friends

  server.registerTool(
    'send_friend_request',
    {
      description: 'Send a friend request to another user.',
      inputSchema: {
        sessionToken: z.string().describe('Token from authenticate'),
        userId: z.string().describe('Target user id'),
      },
    },
    async ({ sessionToken, userId }) => {
      const authed = requireUser(identity, sessionToken);
      try {
        const result = await friendships.request(authed.id, userId);
        return done(result);
      } catch (error) {
        return done({ ok: false, reason: (error as Error).message });
      }
    },
  );

  server.registerTool(
    'accept_friend_request',
    {
      description: 'Accept an incoming friend request.',
      inputSchema: {
        sessionToken: z.string().describe('Token from authenticate'),
        userId: z.string().describe('Id of the user who sent the request'),
      },
    },
    async ({ sessionToken, userId }) => {
      const authed = requireUser(identity, sessionToken);
      try {
        await friendships.accept(authed.id, userId);
        return done({ ok: true, status: 'accepted' });
      } catch (error) {
        return done({ ok: false, reason: (error as Error).message });
      }
    },
  );

  server.registerTool(
    'remove_friend',
    {
      description: 'Unfriend, cancel an outgoing request, or decline an incoming one.',
      inputSchema: {
        sessionToken: z.string().describe('Token from authenticate'),
        userId: z.string().describe('Target user id'),
      },
    },
    async ({ sessionToken, userId }) => {
      const authed = requireUser(identity, sessionToken);
      try {
        const result = friendships.remove(authed.id, userId);
        return done(result);
      } catch (error) {
        return done({ ok: false, reason: (error as Error).message });
      }
    },
  );

  // ------------------------------------------------------- notifications

  server.registerTool(
    'list_notifications',
    {
      description: "List the authenticated user's notifications (newest first).",
      inputSchema: { sessionToken: z.string().describe('Token from authenticate') },
    },
    async ({ sessionToken }) => {
      const authed = requireUser(identity, sessionToken);
      const items = notifications.listForUser(authed.id);
      return done({ items });
    },
  );

  server.registerTool(
    'mark_notifications_read',
    {
      description: "Mark all of the authenticated user's notifications as read.",
      inputSchema: { sessionToken: z.string().describe('Token from authenticate') },
    },
    async ({ sessionToken }) => {
      const authed = requireUser(identity, sessionToken);
      const changed = notifications.markAllRead(authed.id);
      return done({ ok: true, markedRead: changed });
    },
  );

  // ----------------------------------------------------------------- admin

  server.registerTool(
    'admin_stats',
    {
      description: 'Admin: instance stats (user count, admin count, pending friend requests).',
      inputSchema: { sessionToken: z.string().describe('Token from authenticate') },
    },
    async ({ sessionToken }) => {
      requireAdmin(identity, sessionToken);
      return done(admin.stats());
    },
  );

  server.registerTool(
    'admin_list_users',
    {
      description: 'Admin: full searchable user list with role and verification columns.',
      inputSchema: {
        sessionToken: z.string().describe('Token from authenticate'),
        query: z.string().optional().describe('Search by name or email'),
        page: z.number().int().positive().optional().describe('Page number, defaults to 1'),
      },
    },
    async ({ sessionToken, query, page }) => {
      requireAdmin(identity, sessionToken);
      return done(admin.listUsers({ query: query ?? '', page: page ?? 1, perPage: 20 }));
    },
  );

  server.registerTool(
    'admin_change_role',
    {
      description:
        'Admin: promote a user to admin or demote to user. Cannot demote the last admin.',
      inputSchema: {
        sessionToken: z.string().describe('Token from authenticate'),
        userId: z.string().describe('Target user id'),
        role: z.enum(['user', 'admin']).describe('New role'),
      },
    },
    async ({ sessionToken, userId, role }) => {
      const authed = requireAdmin(identity, sessionToken);
      try {
        const updated = admin.changeRole(authed.id, userId, role);
        return updated
          ? done({ ok: true, user: publicUser(updated) })
          : done({ ok: false, reason: 'User not found.' });
      } catch (error) {
        return done({ ok: false, reason: (error as Error).message });
      }
    },
  );

  server.registerTool(
    'admin_edit_user',
    {
      description:
        "Admin: edit a user's name, email, and/or password. Blank password keeps the current one; email/password changes revoke sessions.",
      inputSchema: {
        sessionToken: z.string().describe('Token from authenticate'),
        userId: z.string().describe('Target user id'),
        name: z.string().optional().describe('New display name'),
        email: z.string().optional().describe('New email'),
        password: z.string().optional().describe('New password (8-128 chars), leave blank to keep'),
      },
    },
    async ({ sessionToken, userId, name, email, password }) => {
      requireAdmin(identity, sessionToken);
      const target = admin.getUser(userId);
      if (!target) return done({ ok: false, reason: 'User not found.' });
      try {
        const updated = admin.updateUser(userId, {
          name: name ?? target.name,
          email: email ?? target.email,
          password: password ?? '',
        });
        return updated
          ? done({ ok: true, user: publicUser(updated) })
          : done({ ok: false, reason: 'User not found.' });
      } catch (error) {
        return done({ ok: false, reason: (error as Error).message });
      }
    },
  );

  server.registerTool(
    'admin_delete_user',
    {
      description: 'Admin: delete a user account (cannot delete self or the last admin).',
      inputSchema: {
        sessionToken: z.string().describe('Token from authenticate'),
        userId: z.string().describe('Target user id'),
      },
    },
    async ({ sessionToken, userId }) => {
      const authed = requireAdmin(identity, sessionToken);
      try {
        admin.deleteUser(authed.id, userId);
        return done({ ok: true });
      } catch (error) {
        return done({ ok: false, reason: (error as Error).message });
      }
    },
  );

  server.registerTool(
    'admin_broadcast',
    {
      description: 'Admin: send a system notification to every user on the instance.',
      inputSchema: {
        sessionToken: z.string().describe('Token from authenticate'),
        message: z.string().describe('Message text (max 2000 chars)'),
      },
    },
    async ({ sessionToken, message }) => {
      const authed = requireAdmin(identity, sessionToken);
      try {
        const result = admin.broadcast(authed.id, message);
        return done({ ok: true, recipients: result.recipients });
      } catch (error) {
        return done({ ok: false, reason: (error as Error).message });
      }
    },
  );

  return server;
}
