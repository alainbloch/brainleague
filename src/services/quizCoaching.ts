import type { AttemptReport } from './quizEngine.js';
import type { TestType } from '../models/testsRepository.js';

export interface CategoryPerformance {
  slug: string;
  name: string;
  reviewed: number;
  answered: number;
  correct: number;
  skipped: number;
  accuracy: number | null;
  seconds: number;
  averageSeconds: number | null;
  timedQuestions: number;
  expectedSeconds: number;
}

const workouts: Record<string, string> = {
  arithmetic: 'numerical-workout',
  'word-problems': 'numerical-workout',
  analogies: 'verbal-workout',
  antonyms: 'verbal-workout',
  'sentence-completion': 'verbal-workout',
  'deductive-reasoning': 'verbal-workout',
  'number-series': 'pattern-workout',
  'odd-one-out': 'pattern-workout',
  'figure-series': 'pattern-workout',
};

/** Summarize recorded questions only; unvisited questions and missing times are not invented. */
export function quizCoaching(report: AttemptReport, availableTests: TestType[]) {
  const groups = new Map<string, CategoryPerformance>();
  for (const question of report.questions) {
    const slug = question.categorySlug;
    const group = groups.get(slug) ?? {
      slug,
      name: slug.replaceAll('-', ' '),
      reviewed: 0,
      answered: 0,
      correct: 0,
      skipped: 0,
      accuracy: null,
      seconds: 0,
      averageSeconds: null,
      timedQuestions: 0,
      expectedSeconds: 0,
    };
    group.reviewed++;
    if (question.chosenIndex === null) group.skipped++;
    else group.answered++;
    group.correct += question.isCorrect === 1 ? 1 : 0;
    if (question.hasRecordedTime && Number.isFinite(question.timeMs)) {
      group.seconds += question.timeMs / 1000;
      group.expectedSeconds += question.estSeconds;
      group.timedQuestions++;
    }
    groups.set(slug, group);
  }
  const categories = [...groups.values()].map((g) => ({
    ...g,
    accuracy: g.answered ? Math.round((g.correct / g.answered) * 100) : null,
    averageSeconds: g.timedQuestions ? g.seconds / g.timedQuestions : null,
  }));
  // Prioritize missed/skipped work, then unusually slow categories; alphabetical
  // tie-breaking makes the same report recommend the same next step.
  const ranked = [...categories].sort(
    (a, b) =>
      a.correct / a.reviewed - b.correct / b.reviewed ||
      b.seconds / Math.max(b.expectedSeconds, 1) - a.seconds / Math.max(a.expectedSeconds, 1) ||
      a.slug.localeCompare(b.slug),
  );
  const focus = ranked[0];
  const target =
    availableTests.find((t) => t.slug === workouts[focus?.slug]) ??
    availableTests.find((t) => t.id === report.test.id);
  const recommendation = {
    title: focus ? `Next up: ${focus.name}` : 'Start with a short practice session',
    reason: !focus
      ? 'No question responses were recorded, so there is not enough evidence to identify a weak category.'
      : focus.correct < focus.reviewed
        ? `You earned credit on ${focus.correct} of ${focus.reviewed} reviewed ${focus.name} questions. Review the method, then try a focused workout.`
        : 'You answered every reviewed question correctly. Revisit this category to build fluency; recorded solve times are practice guidance, not a diagnosis.',
    tutorialHref: focus ? `/tutorials?category=${encodeURIComponent(focus.slug)}` : '/tutorials',
    testHref: target ? `/tests/${encodeURIComponent(target.slug)}/take` : '/tests',
    testName: target?.name ?? 'Browse practice tests',
  };
  return { categories, recommendation };
}
