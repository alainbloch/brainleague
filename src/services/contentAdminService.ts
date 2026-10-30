/**
 * Admin content-management use cases for the timed-test catalog: test types,
 * the question bank, question categories, and tutorials. This service owns all
 * content validation rules and is HTTP-free — controllers read inputs and call
 * these methods, repositories own SQL.
 *
 * Domain rule worth stating: there is NO per-question difficulty label. A
 * question's category (category_slug) and expected solve time (est_seconds)
 * are the only classifiers; est_seconds is the ordering key the quiz engine
 * uses to arrange questions easier-to-harder.
 */
import type { TestsRepository } from '../models/testsRepository.js';
import type { QuestionsRepository, QuestionListResult } from '../models/questionsRepository.js';
import type { QuestionCategoriesRepository } from '../models/questionCategoriesRepository.js';
import type { TutorialsRepository, Tutorial } from '../models/tutorialsRepository.js';

interface ContentAdminOptions {
  testsRepo: TestsRepository;
  questionsRepo: QuestionsRepository;
  categoriesRepo: QuestionCategoriesRepository;
  tutorialsRepo: TutorialsRepository;
  clock?: () => number;
}

interface TestTypeInput {
  slug?: string;
  name?: string;
  publisher?: string;
  questionCount?: number | string;
  durationSeconds?: number | string;
  noGoingBack?: string | boolean;
}

interface QuestionInput {
  testTypeId?: string;
  categorySlug?: string;
  prompt?: string;
  choices?: string | string[];
  correctIndex?: number | string;
  explanation?: string;
  estSeconds?: number | string;
}

function asString(value: unknown): string {
  return String(value ?? '').trim();
}

function asInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export class ContentAdminService {
  tests: TestsRepository;
  questions: QuestionsRepository;
  categories: QuestionCategoriesRepository;
  tutorials: TutorialsRepository;
  clock: () => number;

  constructor({
    testsRepo,
    questionsRepo,
    categoriesRepo,
    tutorialsRepo,
    clock = () => Date.now(),
  }: ContentAdminOptions) {
    this.tests = testsRepo;
    this.questions = questionsRepo;
    this.categories = categoriesRepo;
    this.tutorials = tutorialsRepo;
    this.clock = clock;
  }

  // ----- Test types -------------------------------------------------------

  listTestTypes() {
    return this.tests.list();
  }

  getTestType(id: string) {
    return this.tests.findById(id);
  }

  createTestType(input: TestTypeInput) {
    const slug = asString(input.slug);
    const name = asString(input.name);
    const publisher = asString(input.publisher);
    const questionCount = Number(input.questionCount);
    const durationSeconds = Number(input.durationSeconds);

    if (!slug) throw new Error('Slug is required.');
    if (this.tests.findBySlug(slug)) throw new Error('That slug is already in use.');
    if (!name) throw new Error('Name is required.');
    if (!publisher) throw new Error('Publisher is required.');
    if (!Number.isInteger(questionCount) || questionCount <= 0) {
      throw new Error('Question count must be a positive integer.');
    }
    if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
      throw new Error('Duration must be a positive integer of seconds.');
    }
    const created = this.tests.create({
      slug,
      name,
      publisher,
      questionCount,
      durationSeconds,
      noGoingBack: input.noGoingBack !== '0' && input.noGoingBack !== false,
      createdAt: this.clock(),
    });
    if (!created) throw new Error('Could not create the test type.');
    return created;
  }

  updateTestType(id: string, input: TestTypeInput) {
    const existing = this.tests.findById(id);
    if (!existing) throw new Error('Test type not found.');

    const slug = input.slug === undefined ? existing.slug : asString(input.slug);
    if (!slug) throw new Error('Slug is required.');
    const dup = this.tests.findBySlug(slug);
    if (dup && dup.id !== id) throw new Error('That slug is already in use.');

    const name = input.name === undefined ? existing.name : asString(input.name);
    if (!name) throw new Error('Name is required.');
    const publisher = input.publisher === undefined ? existing.publisher : asString(input.publisher);
    if (!publisher) throw new Error('Publisher is required.');

    const questionCount =
      input.questionCount === undefined ? existing.questionCount : Number(input.questionCount);
    if (!Number.isInteger(questionCount) || questionCount <= 0) {
      throw new Error('Question count must be a positive integer.');
    }
    const durationSeconds =
      input.durationSeconds === undefined ? existing.durationSeconds : Number(input.durationSeconds);
    if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
      throw new Error('Duration must be a positive integer of seconds.');
    }

    const updated = this.tests.update(id, {
      slug,
      name,
      publisher,
      questionCount,
      durationSeconds,
      noGoingBack:
        input.noGoingBack === undefined
          ? existing.noGoingBack
          : input.noGoingBack !== '0' && input.noGoingBack !== false,
      updatedAt: this.clock(),
    });
    if (!updated) throw new Error('Could not update the test type.');
    return updated;
  }

  /** Refuse to remove a test type that still has questions in its bank. */
  deleteTestType(id: string) {
    const existing = this.tests.findById(id);
    if (!existing) throw new Error('Test type not found.');
    if (this.tests.countQuestions(id) > 0) {
      throw new Error('Cannot delete a test type that still has questions.');
    }
    if (!this.tests.delete(id)) throw new Error('Could not delete the test type.');
    return true;
  }

  // ----- Question categories ----------------------------------------------

  listCategories() {
    return this.categories.list();
  }

  getCategory(slug: string) {
    return this.categories.findBySlug(slug);
  }

  createCategory({ slug, name }: { slug?: string; name?: string }) {
    const cleanSlug = asString(slug);
    const cleanName = asString(name);
    if (!cleanSlug) throw new Error('Slug is required.');
    if (this.categories.findBySlug(cleanSlug)) throw new Error('That slug is already in use.');
    if (!cleanName) throw new Error('Name is required.');
    return this.categories.create({ slug: cleanSlug, name: cleanName });
  }

  updateCategory(slug: string, { name }: { name?: string }) {
    const existing = this.categories.findBySlug(slug);
    if (!existing) throw new Error('Category not found.');
    const cleanName = asString(name);
    if (!cleanName) throw new Error('Name is required.');
    const updated = this.categories.updateName(slug, cleanName);
    if (!updated) throw new Error('Could not update the category.');
    return updated;
  }

  /** Refuse to remove a category still referenced by questions or tutorials. */
  deleteCategory(slug: string) {
    const existing = this.categories.findBySlug(slug);
    if (!existing) throw new Error('Category not found.');
    if (this.categories.countQuestions(slug) > 0) {
      throw new Error('Cannot delete a category that still has questions.');
    }
    if (this.categories.countTutorials(slug) > 0) {
      throw new Error('Cannot delete a category that still has tutorials.');
    }
    if (!this.categories.delete(slug)) throw new Error('Could not delete the category.');
    return true;
  }

  // ----- Questions ---------------------------------------------------------

  listQuestions({
    testTypeId,
    categorySlug,
    query,
    page = 1,
    perPage = 20,
  }: {
    testTypeId?: string;
    categorySlug?: string;
    query?: string;
    page?: number | string;
    perPage?: number | string;
  }): QuestionListResult {
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const safePer = Math.min(100, Math.max(1, Math.floor(Number(perPage)) || 20));
    return this.questions.list({
      testTypeId,
      categorySlug,
      query,
      limit: safePer,
      offset: (safePage - 1) * safePer,
    });
  }

  getQuestion(id: string) {
    return this.questions.findById(id);
  }

  /** Validate a question payload; throws on invalid input, else persists it. */
  createQuestion(input: QuestionInput) {
    const prompt = asString(input.prompt);
    if (!prompt) throw new Error('Prompt is required.');

    const choices = normalizeChoices(input.choices);
    if (choices.length < 2) throw new Error('A question needs at least two choices.');

    const correctIndex = asInt(input.correctIndex);
    if (correctIndex === null || correctIndex >= choices.length) {
      throw new Error('Correct answer must be a valid choice index.');
    }

    const categorySlug = asString(input.categorySlug);
    if (!categorySlug) throw new Error('Category is required.');
    if (!this.categories.findBySlug(categorySlug)) throw new Error('Unknown category.');

    const estSeconds = Number(input.estSeconds);
    if (!Number.isFinite(estSeconds) || estSeconds <= 0) {
      throw new Error('Expected solve time must be a positive number of seconds.');
    }

    const testTypeId = asString(input.testTypeId);
    if (!testTypeId || !this.tests.findById(testTypeId)) throw new Error('Unknown test type.');

    const created = this.questions.create({
      testTypeId,
      categorySlug,
      prompt,
      choices,
      correctIndex,
      explanation: asString(input.explanation),
      estSeconds,
      createdAt: this.clock(),
    });
    if (!created) throw new Error('Could not create the question.');
    return created;
  }

  updateQuestion(id: string, input: QuestionInput) {
    const existing = this.questions.findById(id);
    if (!existing) throw new Error('Question not found.');

    if (input.prompt !== undefined && !asString(input.prompt)) throw new Error('Prompt is required.');

    let choices = existing.choices;
    if (input.choices !== undefined) {
      choices = normalizeChoices(input.choices);
      if (choices.length < 2) throw new Error('A question needs at least two choices.');
    }

    let correctIndex = existing.correctIndex;
    if (input.correctIndex !== undefined) {
      const validatedIndex = asInt(input.correctIndex);
      if (validatedIndex === null || validatedIndex >= choices.length) {
        throw new Error('Correct answer must be a valid choice index.');
      }
      correctIndex = validatedIndex;
    }

    let categorySlug = existing.categorySlug;
    if (input.categorySlug !== undefined) {
      categorySlug = asString(input.categorySlug);
      if (!categorySlug) throw new Error('Category is required.');
      if (!this.categories.findBySlug(categorySlug)) throw new Error('Unknown category.');
    }

    let estSeconds = existing.estSeconds;
    if (input.estSeconds !== undefined) {
      estSeconds = Number(input.estSeconds);
      if (!Number.isFinite(estSeconds) || estSeconds <= 0) {
        throw new Error('Expected solve time must be a positive number of seconds.');
      }
    }

    const updated = this.questions.update(id, {
      prompt: input.prompt === undefined ? undefined : asString(input.prompt),
      choices: input.choices !== undefined ? choices : undefined,
      correctIndex: input.correctIndex !== undefined ? correctIndex : undefined,
      categorySlug,
      explanation: input.explanation === undefined ? undefined : asString(input.explanation),
      estSeconds: input.estSeconds !== undefined ? estSeconds : undefined,
      updatedAt: this.clock(),
    });
    if (!updated) throw new Error('Could not update the question.');
    return updated;
  }

  deleteQuestion(id: string) {
    if (!this.questions.findById(id)) throw new Error('Question not found.');
    if (!this.questions.delete(id)) throw new Error('Could not delete the question.');
    return true;
  }

  // ----- Tutorials ---------------------------------------------------------

  listTutorials(): Tutorial[] {
    return this.tutorials.list();
  }

  getTutorialBySlug(slug: string): Tutorial | null {
    return this.tutorials.findBySlug(slug);
  }

  createTutorial(input: {
    categorySlug?: string;
    slug?: string;
    title?: string;
    body?: string;
    sortOrder?: number | string;
  }) {
    const categorySlug = asString(input.categorySlug);
    if (!categorySlug) throw new Error('Category is required.');
    if (!this.categories.findBySlug(categorySlug)) throw new Error('Unknown category.');

    const slug = asString(input.slug);
    if (!slug) throw new Error('Slug is required.');
    if (this.tutorials.findBySlug(slug)) throw new Error('That slug is already in use.');

    const title = asString(input.title);
    if (!title) throw new Error('Title is required.');
    const body = asString(input.body);
    if (!body) throw new Error('Body is required.');

    const rawOrder = Number(input.sortOrder);
    const sortOrder = input.sortOrder === undefined || input.sortOrder === '' || !Number.isFinite(rawOrder) ? 0 : rawOrder;
    return this.tutorials.create({
      categorySlug,
      slug,
      title,
      body,
      sortOrder,
      createdAt: this.clock(),
    });
  }

  updateTutorial(
    id: string,
    input: {
      categorySlug?: string;
      slug?: string;
      title?: string;
      body?: string;
      sortOrder?: number | string;
    },
  ) {
    const existing = this.tutorials.findById(id);
    if (!existing) throw new Error('Tutorial not found.');

    let categorySlug = existing.categorySlug;
    if (input.categorySlug !== undefined) {
      categorySlug = asString(input.categorySlug);
      if (!categorySlug) throw new Error('Category is required.');
      if (!this.categories.findBySlug(categorySlug)) throw new Error('Unknown category.');
    }

    let slug = existing.slug;
    if (input.slug !== undefined) {
      slug = asString(input.slug);
      if (!slug) throw new Error('Slug is required.');
      const dup = this.tutorials.findBySlug(slug);
      if (dup && dup.id !== id) throw new Error('That slug is already in use.');
    }

    if (input.title !== undefined && !asString(input.title)) throw new Error('Title is required.');
    if (input.body !== undefined && !asString(input.body)) throw new Error('Body is required.');

    const updated = this.tutorials.update(id, {
      categorySlug,
      slug,
      title: input.title === undefined ? undefined : asString(input.title),
      body: input.body === undefined ? undefined : asString(input.body),
      sortOrder: input.sortOrder === undefined || input.sortOrder === '' ? undefined : Number(input.sortOrder),
      updatedAt: this.clock(),
    });
    if (!updated) throw new Error('Could not update the tutorial.');
    return updated;
  }

  deleteTutorial(id: string) {
    if (!this.tutorials.findById(id)) throw new Error('Tutorial not found.');
    if (!this.tutorials.delete(id)) throw new Error('Could not delete the tutorial.');
    return true;
  }
}

/** Normalize form-provided choices (single field or repeated fields) to an array. */
function normalizeChoices(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((c) => String(c ?? '').trim()).filter(Boolean);
}