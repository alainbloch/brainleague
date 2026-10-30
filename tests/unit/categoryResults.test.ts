import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryResults } from '../../src/ui/categoryResults.js';
import type { ReportQuestion } from '../../src/services/quizEngine.js';

test('category bars use credited correctness and include skipped review rows', () => {
  const row: ReportQuestion = {
    questionId: 'q',
    index: 0,
    prompt: '',
    choices: [],
    categorySlug: 'numbers',
    correctIndex: 0,
    explanation: '',
    chosenIndex: 0,
    isCorrect: 1,
    timeMs: 0,
    estSeconds: 0,
    shouldHaveSkipped: false,
  };
  const result = categoryResults([
    row,
    { ...row, isCorrect: 0, chosenIndex: null },
    { ...row, categorySlug: 'words', isCorrect: 0 },
  ]);
  assert.deepEqual(result, [
    { slug: 'numbers', total: 2, correct: 1, percent: 50 },
    { slug: 'words', total: 1, correct: 0, percent: 0 },
  ]);
  assert.deepEqual(categoryResults([]), []);
});
