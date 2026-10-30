import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quizCoaching } from '../../src/services/quizCoaching.js';
import type { AttemptReport, ReportQuestion } from '../../src/services/quizEngine.js';
import type { TestType } from '../../src/models/testsRepository.js';
import { reasoningVisual } from '../../src/ui/reasoningVisuals.js';
import { practiceTests } from '../../scripts/content/catalog.js';

const testType = { id: 'mixed', slug: 'mixed', name: 'Mixed' } as TestType;
const question = (overrides: Partial<ReportQuestion> = {}): ReportQuestion => ({
  questionId: 'q',
  index: 0,
  prompt: 'Example',
  choices: ['a', 'b'],
  categorySlug: 'arithmetic',
  correctIndex: 0,
  explanation: 'Reason',
  chosenIndex: 0,
  isCorrect: 1,
  timeMs: 10000,
  estSeconds: 20,
  shouldHaveSkipped: false,
  hasRecordedTime: true,
  ...overrides,
});
const report = (questions: ReportQuestion[]) => ({ test: testType, questions }) as AttemptReport;

test('category metrics separate selected answers, skips and unavailable timing', () => {
  const { categories, recommendation } = quizCoaching(
    report([
      question(),
      question({ isCorrect: 0, chosenIndex: 1, timeMs: 20000 }),
      question({ chosenIndex: null, isCorrect: 0, timeMs: 30000 }),
      question({ categorySlug: 'analogies', hasRecordedTime: false, timeMs: 0 }),
    ]),
    [testType, { id: 'n', slug: 'numerical-workout', name: 'Numerical Workout' } as TestType],
  );
  assert.deepEqual(categories[0], {
    slug: 'arithmetic',
    name: 'arithmetic',
    reviewed: 3,
    answered: 2,
    correct: 1,
    skipped: 1,
    accuracy: 50,
    seconds: 60,
    averageSeconds: 20,
    timedQuestions: 3,
    expectedSeconds: 60,
  });
  assert.equal(categories[1].averageSeconds, null);
  assert.equal(recommendation.testHref, '/tests/numerical-workout/take');
  assert.match(recommendation.reason, /1 of 3/);
});

test('all skips and empty reports do not invent accuracy or weak categories', () => {
  const skipped = quizCoaching(report([question({ chosenIndex: null, isCorrect: 0 })]), []);
  assert.equal(skipped.categories[0].accuracy, null);
  assert.equal(skipped.recommendation.testHref, '/tests');
  const empty = quizCoaching(report([]), [testType]);
  assert.deepEqual(empty.categories, []);
  assert.match(empty.recommendation.reason, /not enough evidence/);
});

test('perfect reports recommend fluency and use an available fallback test', () => {
  const result = quizCoaching(report([question({ categorySlug: 'custom/topic' })]), [testType]);
  assert.match(result.recommendation.reason, /every reviewed question correctly/);
  assert.equal(result.recommendation.testHref, '/tests/mixed/take');
  assert.equal(result.recommendation.tutorialHref, '/tutorials?category=custom%2Ftopic');
});

test('all shipped figure questions have accessible diagrams and exact choice alignment', () => {
  const figures = practiceTests
    .flatMap((t) => t.questions)
    .filter((q) => q.category === 'figure-series');
  assert.equal(figures.length, 6);
  for (const q of figures) {
    const visual = reasoningVisual(q);
    assert.ok(visual, q.prompt);
    assert.match(visual.svg, /^<svg/);
    assert.ok(visual.description.length > 20);
    assert.equal(visual.choices.length, q.choices.length);
    assert.equal(reasoningVisual({ ...q, choices: [...q.choices].reverse() }), null);
    assert.equal(reasoningVisual({ ...q, prompt: `${q.prompt} Edited` }), null);
    assert.ok(!('correctIndex' in visual));
  }
});

test('custom and HTML-like question text never becomes trusted SVG', () => {
  assert.equal(
    reasoningVisual({ prompt: '<script>alert(1)</script>', choices: ['<svg onload="bad()">'] }),
    null,
  );
});
