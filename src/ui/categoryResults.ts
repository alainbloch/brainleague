import type { ReportQuestion } from '../services/quizEngine.js';

/** Summarize already-graded review rows; never re-grade answers or infer missing attempts. */
export function categoryResults(questions: ReportQuestion[]) {
  const groups = new Map<string, { slug: string; total: number; correct: number }>();
  for (const question of questions) {
    const slug = question.categorySlug || 'uncategorized';
    const group = groups.get(slug) ?? { slug, total: 0, correct: 0 };
    group.total += 1;
    group.correct += question.isCorrect === 1 ? 1 : 0;
    groups.set(slug, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    percent: Math.round((group.correct / group.total) * 100),
  }));
}
