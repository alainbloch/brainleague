import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ContainerServices } from '../container.js';

/**
 * Public tutorials: a simple signed-in user-facing list and detail view for the
 * category-keyed tips written by admins. Uses the same ContentAdminService
 * read methods the admin screens do — no HTTP knowledge lives in the service.
 */
export class TutorialsController {
  content: ContainerServices['contentAdmin'];

  constructor({ content }: { content: ContainerServices['contentAdmin'] }) {
    this.content = content;
  }

  async showList(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    return reply.view('tutorials', {
      pageTitle: 'Tutorials',
      user: request.user,
      tutorials: this.content.listTutorials(),
    });
  }

  async showDetail(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { slug: string };
    const tutorial = this.content.getTutorialBySlug(params.slug);
    if (!tutorial) return reply.redirect('/tutorials');
    return reply.view('tutorial', {
      pageTitle: tutorial.title,
      user: request.user,
      tutorial,
    });
  }
}