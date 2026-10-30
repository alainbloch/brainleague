/**
 * Seed the timed-test content: the PI Cognitive Assessment test type, its
 * question categories, and an initial bank of original practice questions.
 *
 * This is the authorable source of truth for practice content. Questions are
 * decorated with a category and an expected solve time (est_seconds) — there is
 * no hand-entered difficulty label; est_seconds is the ordering key used by the
 * quiz engine. More questions/test types can be appended here later.
 *
 * Idempotent: keys are inserted only if absent, so re-running is safe and does
 * not duplicate rows. Usage: npx tsx scripts/seed-content.ts
 */
import { buildContainer } from '../src/container.js';

interface FreeTextChoice {
  category: string;
  prompt: string;
  choices: string[];
  correct: number; // index into choices
  explanation: string;
  estSeconds: number;
}

// PI Cognitive Assessment: 50 questions in 12 minutes (no calculator).
const TEST = {
  id: 'pi-cognitive-assessment',
  slug: 'pi-cognitive-assessment',
  name: 'PI Cognitive Assessment',
  publisher: 'Predictive Index',
  questionCount: 50,
  durationSeconds: 12 * 60,
  categories: [
    ['analogies', 'Analogies'],
    ['antonyms', 'Antonyms'],
    ['sentence-completion', 'Sentence completion'],
    ['arithmetic', 'Arithmetic'],
    ['word-problems', 'Word problems'],
    ['number-series', 'Number series'],
    ['odd-one-out', 'Odd one out'],
    ['figure-series', 'Figure series'],
  ] as const,

  // A starting bank of original questions. Order here is authoring order; the
  // engine arranges them by est_seconds at test time.
  questions: [
    {
      category: 'analogies',
      prompt: 'Finger is to hand as leaf is to ______.',
      choices: ['branch', 'tree', 'green', 'fall'],
      correct: 1,
      explanation: 'A finger is a part of a hand; a leaf is a part of a tree.',
      estSeconds: 18,
    },
    {
      category: 'analogies',
      prompt: 'Author is to book as composer is to ______.',
      choices: ['piano', 'melody', 'orchestra', 'concert hall'],
      correct: 1,
      explanation: 'An author creates a book; a composer creates a melody (a musical work).',
      estSeconds: 18,
    },
    {
      category: 'analogies',
      prompt: 'Winter is to cold as summer is to ______.',
      choices: ['sun', 'warm', 'season', 'beach'],
      correct: 1,
      explanation: 'Winter is associated with cold; summer is associated with warmth.',
      estSeconds: 14,
    },
    {
      category: 'antonyms',
      prompt: 'Choose the word most nearly OPPOSITE in meaning to "abundant".',
      choices: ['plentiful', 'scarce', 'generous', 'full'],
      correct: 1,
      explanation: 'Abundant means ample in supply; the opposite is scarce.',
      estSeconds: 16,
    },
    {
      category: 'antonyms',
      prompt: 'Choose the word most nearly OPPOSITE in meaning to "temporary".',
      choices: ['brief', 'lasting', 'momentary', 'seasonal'],
      correct: 1,
      explanation: 'Temporary means lasting for a limited time; the opposite is lasting (permanent).',
      estSeconds: 16,
    },
    {
      category: 'sentence-completion',
      prompt: 'The committee reached a ______ decision after hours of debate.',
      choices: ['hasty', 'unanimous', 'random', 'silent'],
      correct: 1,
      explanation: 'After lengthy debate, a unanimous decision reflects everyone agreeing.',
      estSeconds: 15,
    },
    {
      category: 'arithmetic',
      prompt: 'A sweater costs $45. It is on sale for 20% off. How much do you pay?',
      choices: ['$30', '$36', '$40', '$9'],
      correct: 1,
      explanation: '20% of $45 is $9; $45 - $9 = $36.',
      estSeconds: 20,
    },
    {
      category: 'arithmetic',
      prompt: 'What is the next number in the sequence: 3, 6, 12, 24, ______?',
      choices: ['30', '48', '36', '26'],
      correct: 1,
      explanation: 'Each term doubles the previous: 24 × 2 = 48.',
      estSeconds: 15,
    },
    {
      category: 'arithmetic',
      prompt: 'If 4 workers can complete a job in 6 days, how many days would 8 workers take?',
      choices: ['12', '2', '3', '4'],
      correct: 2,
      explanation: 'Doubling the workers halves the time: 6 / 2 = 3 days.',
      estSeconds: 24,
    },
    {
      category: 'word-problems',
      prompt: 'A train travels 300 km at a constant speed of 75 km/h. How long does the journey take?',
      choices: ['4 hours', '3 hours', '5 hours', '2 hours'],
      correct: 0,
      explanation: 'Time = distance / speed = 300 / 75 = 4 hours.',
      estSeconds: 22,
    },
    {
      category: 'word-problems',
      prompt: 'Mary is twice as old as her brother. If her brother is 12, how old is Mary?',
      choices: ['14', '22', '26', '24'],
      correct: 3,
      explanation: 'Twice 12 is 24.',
      estSeconds: 14,
    },
    {
      category: 'number-series',
      prompt: 'What comes next: 2, 5, 9, 14, ______?',
      choices: ['20', '19', '18', '21'],
      correct: 0,
      explanation: 'Differences increase: +3, +4, +5, so next is +6 → 14 + 6 = 20.',
      estSeconds: 20,
    },
    {
      category: 'number-series',
      prompt: 'What comes next: 81, 27, 9, 3, ______?',
      choices: ['0', '6', '1', '1/3'],
      correct: 2,
      explanation: 'Each term is divided by 3: 3 / 3 = 1.',
      estSeconds: 18,
    },
    {
      category: 'odd-one-out',
      prompt: 'Which word does NOT belong with the others?',
      choices: ['Rose', 'Daisy', 'Oak', 'Tulip'],
      correct: 2,
      explanation: 'Oak is a tree; the others are flowers.',
      estSeconds: 12,
    },
    {
      category: 'odd-one-out',
      prompt: 'Which number does NOT belong with the others?',
      choices: ['2', '4', '7', '8'],
      correct: 2,
      explanation: '7 is the only odd (not divisible by 2) number.',
      estSeconds: 12,
    },
    {
      category: 'figure-series',
      prompt: '(Figure sequence described in words) The figure rotates 90° clockwise and grows. What moves?',
      choices: ['Rotation only', 'Growth only', 'Both rotation and growth', 'Neither'],
      correct: 2,
      explanation: 'The described transformation changes both orientation (rotation) and size (growth).',
      estSeconds: 20,
    },
  ] as FreeTextChoice[],
};

const TUTORIALS: Array<{ category: string; slug: string; title: string; body: string; order: number }> = [
  { category: 'analogies', slug: 'analogies', title: 'Analogies: spot the relationship', order: 1, body: `Analogies ask you to find the same relationship between two words in all four.

1. Put the given pair into a sentence: "a finger is PART of a hand".
2. Test each option with the same sentence form.
3. If the first pair reads naturally in one way but not another, the exact phrasing is usually the answer.

Common patterns: part/whole, cause/effect, tool/action, category/member. When two options both seem plausible, the one that keeps the SAME part of speech and the SAME relationship order wins.` },
  { category: 'antonyms', slug: 'antonyms', title: 'Antonyms: find the opposite', order: 2, body: `Pick the word most nearly OPPOSITE in meaning.

1. Define the target word in your head before looking at choices.
2. Work by elimination: cross out synonyms and near-synonyms first.
3. A good opposite usually lives in the same "register" (formal/plain) as the target and is one clear step away, not a mere difference.

Watch out for distractors that mean something similar to the OPPOSITE of the opposite — that is, a synonym dressed up. If you know only whether a word is positive or negative, that polarity alone often knocks out half the options.` },
  { category: 'sentence-completion', slug: 'sentence-completion', title: 'Sentence completion: let the clues lead', order: 3, body: `Fill the blank so the sentence stays logical.

1. Read the full sentence first; don't just grab the blank.
2. Identify the signal word — "but"/"however" (contrast), "therefore"/"since" (cause), "and"/"also" (agreement). The blank usually continues or reverses what came before.
3. Insert each option in your head and read the whole sentence aloud quietly. The right one makes the sentence read naturally and logically.

Your first instinct is usually right. Don't overthink and second-guess into a wrong trap.` },
  { category: 'arithmetic', slug: 'arithmetic', title: 'Arithmetic: work it fast and check once', order: 4, body: `Timed tests reward speed on basic arithmetic.

1. Do the calculation step by step on scratch and keep numbers tidy.
2. Use shortcuts: percentages are easiest as $X$ of $10$ is just move the decimal; a 25% discount is divide by 4.
3. Estimate first: if the answer choices span orders of magnitude, a rough estimate eliminates most without a full calculation.

Round-trip check on your final digit and decimal place before committing. A single sign slip is the most common error.` },
  { category: 'word-problems', slug: 'word-problems', title: 'Word problems: decode, translate, solve', order: 5, body: `Word problems hide math inside sentences.

1. Underline the numbers and the ask (what are you solving?).
2. Translate the sentence into an equation: "twice as old as" -> $x$ and $2x$; "total" -> sum; "per" -> division.
3. Ignore the story and solve the math.

If two answer choices are just swapped values (e.g. 3 and 4), the trap is reversing a ratio or a rate. Define your variable clearly so you don't solve for the wrong quantity.` },
  { category: 'number-series', slug: 'number-series', title: 'Number series: find the step', order: 6, body: `A number series hides a rule between each term.

1. Compute the DIFFERENCES between consecutive terms first.
2. Differences constant? -> arithmetic. Differences themselves growing by a fixed amount? -> quadratic. Ratios constant? -> geometric.
3. Occasionally alternate two rules by position (every other term follows its own pattern).

Most timed-test series use one of three: adding a value, multiplying, or alternating a pair. Find the step, extend it once, and you have the answer.` },
  { category: 'odd-one-out', slug: 'odd-one-out', title: 'Odd one out: name the category', order: 7, body: `Find the item that does not belong.

1. Ask "what do all but one share?" — category, property, relationship.
2. There is always a defensible rule that groups the other three; the odd one breaks it.
3. If two rules seem to fit different answer choices, pick the most concrete/obvious category (concrete nouns beat abstract attributes).

Don't force it. The three similar items usually share an easy-to-name trait; the odd one differs on exactly that trait.` },
  { category: 'figure-series', slug: 'figure-series', title: 'Figure series: describe the transformation', order: 8, body: `Figure series test pattern perception.

1. Describe the change from one frame to the next in words: rotation, growth, color, count, position.
2. Apply the SAME rule to the last frame to predict the next.
3. Often more than one change happens at once (rotate AND grow); track each separately.

If a frame repeats, the next frame in the sequence reuses the transformation, not a brand-new one. Rule out by elimination frame by frame.` },
];
function run(): void {
  const container = buildContainer();
  const db = container.db;

  try {
    db.transaction(() => {
      // Test type
      const hasTest = db
        .prepare('SELECT 1 FROM test_types WHERE slug = ?')
        .get(TEST.slug);
      if (!hasTest) {
        db.prepare(
          `INSERT INTO test_types (id, slug, name, publisher, question_count, duration_seconds, no_going_back, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        ).run(
          TEST.id,
          TEST.slug,
          TEST.name,
          TEST.publisher,
          TEST.questionCount,
          TEST.durationSeconds,
          Date.now(),
        );
        console.log(`Seed: test type ${TEST.name} (${TEST.questionCount} questions / ${TEST.durationSeconds / 60} min)`);
      } else {
        console.log(`Seed: test type ${TEST.name} already present, skipping.`);
      }

      // Categories
      for (const [slug, name] of TEST.categories) {
        db.prepare('INSERT OR IGNORE INTO question_categories (slug, name) VALUES (?, ?)').run(slug, name);
      }

      // Questions
      let added = 0;
      const insertQuestion = db.prepare(
        `INSERT OR IGNORE INTO questions
           (id, test_type_id, section_id, category_slug, prompt, choices_json, correct_index, explanation, est_seconds, position, created_at, updated_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      TEST.questions.forEach((q, i) => {
        const id = `${TEST.id}-q${String(i + 1).padStart(3, '0')}`;
        const res = insertQuestion.run(
          id,
          TEST.id,
          q.category,
          q.prompt,
          JSON.stringify(q.choices),
          q.correct,
          q.explanation,
          q.estSeconds,
          i + 1,
          Date.now(),
          Date.now(),
        );
        if (res.changes > 0) added += 1;
      });

      // Tutorials / help content keyed by category
      let tutorialsAdded = 0;
      const insertTutorial = db.prepare(
        `INSERT OR IGNORE INTO tutorials (id, category_slug, slug, title, body, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      TUTORIALS.forEach((t) => {
        const id = `tutorial-${t.slug}`;
        const res = insertTutorial.run(
          id,
          t.category,
          t.slug,
          t.title,
          t.body,
          t.order,
          Date.now(),
          Date.now(),
        );
        if (res.changes > 0) tutorialsAdded += 1;
      });

      console.log(`Seed: ${added} questions added (${TEST.questions.length} in bank).`);
      if (tutorialsAdded > 0) console.log(`Seed: ${tutorialsAdded} tutorials added.`);
    })();

    console.log(
      `\nContent seed complete. Test: ${TEST.name} at ${TEST.slug}. ` +
        `Questions live in /admin/questions or via scripts/seed-content.ts.`,
    );
  } finally {
    container.close();
  }
}

run();