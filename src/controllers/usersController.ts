import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ContainerServices } from '../container.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * User directory and profile pages plus friendship actions. Thin HTTP layer;
 * relationship state machines live in the friendship service.
 */
export class UsersController {
  directory: ContainerServices['directory'];
  friendships: ContainerServices['friendships'];

  constructor({
    directory,
    friendships,
  }: {
    directory: ContainerServices['directory'];
    friendships: ContainerServices['friendships'];
  }) {
    this.directory = directory;
    this.friendships = friendships;
  }

  async showDirectory(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = (request.query || {}) as { q?: string; page?: string };
    const q = query.q ?? '';
    const data = this.directory.listUsers({
      query: q,
      page: Number(query.page) || 1,
      perPage: 12,
    });
    return reply.view('users', {
      pageTitle: 'Users',
      user: request.user,
      directory: data,
      q: String(q),
    });
  }

  async showProfile(
    request: FastifyRequest,
    reply: FastifyReply,
    { error }: { error?: string } = {},
  ): Promise<FastifyReply> {
    const params = request.params as { id?: string };
    const profile = this.directory.getProfile(request.user!.id, params.id!);
    if (!profile)
      return reply.code(404).view('not-found', { pageTitle: 'Not found', user: request.user });
    return reply.view('profile', {
      pageTitle: profile.user.name,
      user: request.user,
      profile,
      error,
    });
  }

  async sendFriendRequest(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { id?: string };
    const targetId = params.id!;
    try {
      await this.friendships.request(request.user!.id, targetId);
      return reply.redirect(`/users/${targetId}`);
    } catch (error) {
      return this.showProfile(request, reply, { error: errorMessage(error) });
    }
  }

  async acceptFriendRequest(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { id?: string };
    const targetId = params.id!;
    try {
      await this.friendships.accept(request.user!.id, targetId);
      return reply.redirect(`/users/${targetId}`);
    } catch (error) {
      return this.showProfile(request, reply, { error: errorMessage(error) });
    }
  }

  async removeFriend(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { id?: string };
    const targetId = params.id!;
    try {
      await this.friendships.remove(request.user!.id, targetId);
      return reply.redirect(`/users/${targetId}`);
    } catch (error) {
      return this.showProfile(request, reply, { error: errorMessage(error) });
    }
  }
}
