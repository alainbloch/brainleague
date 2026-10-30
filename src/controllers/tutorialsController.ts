import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ContainerServices } from '../container.js';

/**
 * Public tutorials: a signed-in user-facing list (optionally filtered by
 * question category) and a detail view for the category-keyed tips written by
 * admins. Uses the same ContentAdminService read methods the admin screens do —
 * no HTTP knowledge lives in the service.
 */
export class TutorialsController {
  content: ContainerServices['contentAdmin'];

  constructor({ content }: { content: ContainerServices['contentAdmin'] }) {
    this.content = content;
  }

  async showList(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = (request.query || {}) as { category?: string };
    const categories = this.content.listCategories();
    const categorySlug = query.category ?? '';
    const tutorials = categorySlug
      ? this.content.listTutorials().filter((t) => t.categorySlug === categorySlug)
      : this.content.listTutorials();

    return reply.view('tutorials', {
      pageTitle: 'Tutorials',
      user: request.user,
      tutorials,
      categories,
      categorySlug,
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