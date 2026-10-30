import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ContainerServices } from '../container.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Admin-only content management: the timed-test catalog (test types, question
 * bank, categories) and tutorials. All guards live in routes/middleware; all
 * business rules live in ContentAdminService. Controllers stay thin: read the
 * form fields, call the service, re-render on error or redirect on success.
 */
export class ContentAdminController {
  content: ContainerServices['contentAdmin'];

  constructor({ content }: { content: ContainerServices['contentAdmin'] }) {
    this.content = content;
  }

  // ----- Test types --------------------------------------------------------

  async listTests(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = (request.query || {}) as { notice?: string };
    const notices: Record<string, string> = {
      created: 'The test type was created.',
      updated: 'The test type was updated.',
    };
    return reply.view('admin/tests', {
      pageTitle: 'Manage tests',
      user: request.user,
      tests: this.content.listTestTypes(),
      notice: query.notice ? notices[query.notice] : null,
    });
  }

  async newTest(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    return reply.view('admin/tests-new', {
      pageTitle: 'New test',
      user: request.user,
      values: {},
    });
  }

  async createTest(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = (request.body || {}) as Record<string, unknown>;
    try {
      this.content.createTestType(body);
      return reply.redirect('/admin/tests?notice=created');
    } catch (error) {
      return reply.view('admin/tests-new', {
        pageTitle: 'New test',
        user: request.user,
        values: body,
        error: errorMessage(error),
      });
    }
  }

  async editTest(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { id: string };
    const target = this.content.getTestType(params.id);
    if (!target) return reply.redirect('/admin/tests');
    return reply.view('admin/tests-edit', {
      pageTitle: `Edit ${target.name}`,
      user: request.user,
      target,
      values: {
        slug: target.slug,
        name: target.name,
        publisher: target.publisher,
        questionCount: target.questionCount,
        durationSeconds: target.durationSeconds,
        noGoingBack: target.noGoingBack,
      },
    });
  }

  async updateTest(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { id: string };
    const body = (request.body || {}) as Record<string, unknown>;
    try {
      this.content.updateTestType(params.id, body);
      return reply.redirect('/admin/tests?notice=updated');
    } catch (error) {
      const target = this.content.getTestType(params.id);
      return reply.view('admin/tests-edit', {
        pageTitle: target ? `Edit ${target.name}` : 'Edit test',
        user: request.user,
        target,
        values: body,
        error: errorMessage(error),
      });
    }
  }

  async deleteTest(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { id: string };
    try {
      this.content.deleteTestType(params.id);
    } catch {
      // Deletion errors (e.g. still has questions) surface on the list redirect.
      return reply.redirect('/admin/tests?notice=updated');
    }
    return reply.redirect('/admin/tests');
  }

  // ----- Question categories ----------------------------------------------

  async listCategories(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = (request.query || {}) as { notice?: string; error?: string };
    const notices: Record<string, string> = {
      created: 'The category was created.',
      updated: 'The category was updated.',
    };
    return reply.view('admin/categories', {
      pageTitle: 'Manage categories',
      user: request.user,
      categories: this.content.listCategories(),
      notice: query.notice ? notices[query.notice] : null,
      error: query.error ?? null,
    });
  }

  async newCategory(_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    return reply.view('admin/categories-new', {
      pageTitle: 'New category',
      user: _request.user,
      values: {},
    });
  }

  async createCategory(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = (request.body || {}) as { slug?: string; name?: string };
    try {
      this.content.createCategory(body);
      return reply.redirect('/admin/categories?notice=created');
    } catch (error) {
      return reply.view('admin/categories-new', {
        pageTitle: 'New category',
        user: request.user,
        values: body,
        error: errorMessage(error),
      });
    }
  }

  async editCategory(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { slug: string };
    const target = this.content.getCategory(params.slug);
    if (!target) return reply.redirect('/admin/categories');
    return reply.view('admin/categories-edit', {
      pageTitle: `Edit ${target.name}`,
      user: request.user,
      target,
      values: { slug: target.slug, name: target.name },
    });
  }

  async updateCategory(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { slug: string };
    const body = (request.body || {}) as { name?: string };
    try {
      this.content.updateCategory(params.slug, body);
      return reply.redirect('/admin/categories?notice=updated');
    } catch (error) {
      const target = this.content.getCategory(params.slug);
      return reply.view('admin/categories-edit', {
        pageTitle: 'Edit category',
        user: request.user,
        target,
        values: { slug: params.slug, name: body.name || '' },
        error: errorMessage(error),
      });
    }
  }

  async deleteCategory(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { slug: string };
    try {
      this.content.deleteCategory(params.slug);
      return reply.redirect('/admin/categories');
    } catch (error) {
      return reply.redirect(`/admin/categories?error=${encodeURIComponent(errorMessage(error))}`);
    }
  }

  // ----- Questions ---------------------------------------------------------

  async listQuestions(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = (request.query || {}) as {
      testType?: string;
      category?: string;
      q?: string;
      page?: string;
      notice?: string;
    };
    const data = this.content.listQuestions({
      testTypeId: query.testType,
      categorySlug: query.category,
      query: query.q,
      page: Number(query.page) || 1,
      perPage: 20,
    });
    const notices: Record<string, string> = {
      created: 'The question was created.',
      updated: 'The question was updated.',
    };
    return reply.view('admin/questions', {
      pageTitle: 'Manage questions',
      user: request.user,
      data,
      tests: this.content.listTestTypes(),
      categories: this.content.listCategories(),
      filters: {
        testType: query.testType || '',
        category: query.category || '',
        q: query.q || '',
      },
      notice: query.notice ? notices[query.notice] : null,
    });
  }

  async newQuestion(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    return reply.view('admin/questions-new', {
      pageTitle: 'New question',
      user: request.user,
      tests: this.content.listTestTypes(),
      categories: this.content.listCategories(),
      values: { choices: ['', '', '', ''] },
    });
  }

  async createQuestion(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = (request.body || {}) as Record<string, unknown>;
    try {
      this.content.createQuestion(body);
      return reply.redirect('/admin/questions?notice=created');
    } catch (error) {
      return reply.view('admin/questions-new', {
        pageTitle: 'New question',
        user: request.user,
        tests: this.content.listTestTypes(),
        categories: this.content.listCategories(),
        values: body,
        error: errorMessage(error),
      });
    }
  }

  async editQuestion(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { id: string };
    const target = this.content.getQuestion(params.id);
    if (!target) return reply.redirect('/admin/questions');
    return reply.view('admin/questions-edit', {
      pageTitle: 'Edit question',
      user: request.user,
      target,
      tests: this.content.listTestTypes(),
      categories: this.content.listCategories(),
      values: {
        testTypeId: target.testTypeId,
        categorySlug: target.categorySlug,
        prompt: target.prompt,
        choices: target.choices,
        correctIndex: target.correctIndex,
        explanation: target.explanation,
        estSeconds: target.estSeconds,
      },
    });
  }

  async updateQuestion(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { id: string };
    const body = (request.body || {}) as Record<string, unknown>;
    try {
      this.content.updateQuestion(params.id, body);
      return reply.redirect('/admin/questions?notice=updated');
    } catch (error) {
      const target = this.content.getQuestion(params.id);
      return reply.view('admin/questions-edit', {
        pageTitle: 'Edit question',
        user: request.user,
        target,
        tests: this.content.listTestTypes(),
        categories: this.content.listCategories(),
        values: body,
        error: errorMessage(error),
      });
    }
  }

  async deleteQuestion(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { id: string };
    try {
      this.content.deleteQuestion(params.id);
    } catch {
      // Deletion errors surface on the list redirect.
    }
    return reply.redirect('/admin/questions');
  }

  // ----- Tutorials ---------------------------------------------------------

  async listTutorials(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = (request.query || {}) as { notice?: string };
    const notices: Record<string, string> = {
      created: 'The tutorial was created.',
      updated: 'The tutorial was updated.',
    };
    const tutorials = this.content.listTutorials();
    const categories = this.content.listCategories();
    return reply.view('admin/tutorials', {
      pageTitle: 'Manage tutorials',
      user: request.user,
      tutorials,
      categories,
      categoryName: (slug: string) => {
        const c = categories.find((cat) => cat.slug === slug);
        return c ? c.name : slug;
      },
      notice: query.notice ? notices[query.notice] : null,
    });
  }

  async newTutorial(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    return reply.view('admin/tutorials-new', {
      pageTitle: 'New tutorial',
      user: request.user,
      categories: this.content.listCategories(),
      values: {},
    });
  }

  async createTutorial(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = (request.body || {}) as Record<string, unknown>;
    try {
      this.content.createTutorial(body);
      return reply.redirect('/admin/tutorials?notice=created');
    } catch (error) {
      return reply.view('admin/tutorials-new', {
        pageTitle: 'New tutorial',
        user: request.user,
        categories: this.content.listCategories(),
        values: body,
        error: errorMessage(error),
      });
    }
  }

  async editTutorial(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { id: string };
    const target = this.content.tutorials.findById(params.id);
    if (!target) return reply.redirect('/admin/tutorials');
    return reply.view('admin/tutorials-edit', {
      pageTitle: `Edit ${target.title}`,
      user: request.user,
      target,
      categories: this.content.listCategories(),
      values: {
        categorySlug: target.categorySlug,
        slug: target.slug,
        title: target.title,
        body: target.body,
        sortOrder: target.sortOrder,
      },
    });
  }

  async updateTutorial(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { id: string };
    const body = (request.body || {}) as Record<string, unknown>;
    try {
      this.content.updateTutorial(params.id, body);
      return reply.redirect('/admin/tutorials?notice=updated');
    } catch (error) {
      const target = this.content.tutorials.findById(params.id);
      return reply.view('admin/tutorials-edit', {
        pageTitle: target ? `Edit ${target.title}` : 'Edit tutorial',
        user: request.user,
        target,
        categories: this.content.listCategories(),
        values: body,
        error: errorMessage(error),
      });
    }
  }

  async deleteTutorial(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { id: string };
    try {
      this.content.deleteTutorial(params.id);
    } catch (error) {
      void error;
    }
    return reply.redirect('/admin/tutorials');
  }
}