import { LEGACY_TEST } from './legacy.js';
import { numericalQuestions } from './numerical.js';
import { verbalQuestions } from './verbal.js';
import { patternsQuestions } from './patterns.js';
import type { PracticeTest } from './types.js';

export const categories = [
  ...LEGACY_TEST.categories,
  ['deductive-reasoning', 'Deductive reasoning'],
] as const;

// Keep legacy question IDs stable: saved attempts reference them. Every bank has
// exactly its advertised length because the current engine presents the full bank.
export const practiceTests: PracticeTest[] = [
  {
    id: LEGACY_TEST.id,
    name: LEGACY_TEST.name,
    publisher: LEGACY_TEST.publisher,
    durationSeconds: LEGACY_TEST.durationSeconds,
    questions: [
      ...LEGACY_TEST.questions.map((q, i) => ({ ...q, key: `q${String(i + 1).padStart(3, '0')}` })),
      ...numericalQuestions.slice(0, 12),
      ...verbalQuestions.slice(0, 11),
      ...patternsQuestions.slice(0, 11),
    ],
  },
  {
    id: 'numerical-workout',
    name: 'Numerical Workout',
    publisher: 'BrainLeague',
    durationSeconds: 600,
    questions: numericalQuestions,
  },
  {
    id: 'verbal-workout',
    name: 'Verbal Workout',
    publisher: 'BrainLeague',
    durationSeconds: 420,
    questions: verbalQuestions,
  },
  {
    id: 'pattern-workout',
    name: 'Pattern & Logic Workout',
    publisher: 'BrainLeague',
    durationSeconds: 480,
    questions: patternsQuestions,
  },
];
