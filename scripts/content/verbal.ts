import type { PracticeQuestion } from './types.js';

export const verbalQuestions: PracticeQuestion[] = [
  {
    key: 'verbal-01',
    category: 'analogies',
    prompt: 'Thermometer is to temperature as stopwatch is to ______.',
    choices: ['distance', 'time', 'weight', 'speed'],
    correct: 1,
    explanation:
      'A thermometer measures temperature; a stopwatch measures elapsed time. Keep the instrument-to-measurement relationship.',
    estSeconds: 18,
  },
  {
    key: 'verbal-02',
    category: 'analogies',
    prompt: 'Sculptor is to statue as architect is to ______.',
    choices: ['paint', 'marble', 'building', 'hammer'],
    correct: 2,
    explanation:
      'A sculptor designs or creates a statue; an architect designs a building. Both pairs link a creator to a work.',
    estSeconds: 18,
  },
  {
    key: 'verbal-03',
    category: 'analogies',
    prompt: 'Seed is to plant as egg is to ______.',
    choices: ['bird', 'nest', 'shell', 'feather'],
    correct: 0,
    explanation:
      'A seed can develop into a plant; an egg can develop into a bird. Nest is a location, not the developed organism.',
    estSeconds: 20,
  },
  {
    key: 'verbal-04',
    category: 'analogies',
    prompt: 'Chapter is to novel as scene is to ______.',
    choices: ['actor', 'stage', 'audience', 'play'],
    correct: 3,
    explanation:
      'A chapter is a structural part of a novel; a scene is a structural part of a play.',
    estSeconds: 18,
  },
  {
    key: 'verbal-05',
    category: 'analogies',
    prompt: 'Drought is to water shortage as famine is to ______.',
    choices: ['rainfall', 'food shortage', 'harvest', 'thirst'],
    correct: 1,
    explanation:
      'Drought involves a shortage of water; famine involves a shortage of food. Match the kind of shortage.',
    estSeconds: 20,
  },
  {
    key: 'verbal-06',
    category: 'antonyms',
    prompt: 'Choose the word most nearly OPPOSITE to "reluctant".',
    choices: ['hesitant', 'uncertain', 'willing', 'cautious'],
    correct: 2,
    explanation:
      'Reluctant means unwilling or hesitant. Willing reverses that meaning; the other choices do not.',
    estSeconds: 16,
  },
  {
    key: 'verbal-07',
    category: 'antonyms',
    prompt: 'Choose the word most nearly OPPOSITE to "concise".',
    choices: ['wordy', 'brief', 'clear', 'precise'],
    correct: 0,
    explanation:
      'Concise means expressing something in few words. Wordy means using many words. Clear is not an opposite.',
    estSeconds: 18,
  },
  {
    key: 'verbal-08',
    category: 'antonyms',
    prompt: 'Choose the word most nearly OPPOSITE to "conceal".',
    choices: ['cover', 'hide', 'protect', 'reveal'],
    correct: 3,
    explanation: 'To conceal is to hide; to reveal is to make known or visible.',
    estSeconds: 14,
  },
  {
    key: 'verbal-09',
    category: 'antonyms',
    prompt: 'Choose the word most nearly OPPOSITE to "impartial".',
    choices: ['fair', 'biased', 'neutral', 'balanced'],
    correct: 1,
    explanation: 'Impartial means not favoring either side. Biased means favoring one side.',
    estSeconds: 18,
  },
  {
    key: 'verbal-10',
    category: 'antonyms',
    prompt: 'Choose the word most nearly OPPOSITE to "taciturn".',
    choices: ['quiet', 'reserved', 'talkative', 'thoughtful'],
    correct: 2,
    explanation:
      'Taciturn means habitually saying little. Talkative is the opposite. Thoughtful describes thinking, not how much someone talks.',
    estSeconds: 22,
  },
  {
    key: 'verbal-11',
    category: 'sentence-completion',
    prompt:
      'Although the first design failed, the team remained ______ and kept trying until it worked.',
    choices: ['persistent', 'indifferent', 'defeated', 'uninterested'],
    correct: 0,
    explanation:
      'Kept trying supports persistent. Although signals a contrast between failure and continuing effort.',
    estSeconds: 20,
  },
  {
    key: 'verbal-12',
    category: 'sentence-completion',
    prompt:
      'Because the instructions could be interpreted in two different ways, the editor called them ______.',
    choices: ['precise', 'identical', 'complete', 'ambiguous'],
    correct: 3,
    explanation:
      'Ambiguous means open to more than one interpretation. The cause clause supplies the definition.',
    estSeconds: 18,
  },
  {
    key: 'verbal-13',
    category: 'sentence-completion',
    prompt: 'Unlike his impulsive partner, Omar was ______, considering each risk before acting.',
    choices: ['reckless', 'cautious', 'hasty', 'careless'],
    correct: 1,
    explanation:
      'Unlike introduces contrast. Considering risks describes cautious behavior, the opposite of impulsiveness.',
    estSeconds: 18,
  },
  {
    key: 'verbal-14',
    category: 'sentence-completion',
    prompt:
      'The measurements agreed on every repeated trial, so the results were described as ______.',
    choices: ['erratic', 'contradictory', 'consistent', 'unrelated'],
    correct: 2,
    explanation:
      'Agreement across repetitions supports consistent. Erratic and contradictory imply variation or conflict.',
    estSeconds: 20,
  },
  {
    key: 'verbal-15',
    category: 'sentence-completion',
    prompt: 'The proposal was rejected because its costs ______ the available budget.',
    choices: ['exceeded', 'matched', 'reduced', 'funded'],
    correct: 0,
    explanation:
      'Costs that exceed a budget provide the stated reason for rejection. Matching the budget does not imply that problem.',
    estSeconds: 18,
  },
  {
    key: 'verbal-16',
    category: 'deductive-reasoning',
    prompt:
      'All gliders in a club are aircraft. No aircraft in the club are red. What must be true?',
    choices: [
      'All aircraft are gliders',
      'Some gliders are red',
      'Nothing in the club is red',
      'No gliders in the club are red',
    ],
    correct: 3,
    explanation:
      'Gliders are within the aircraft group, and that entire group excludes red items. Nothing is said about other club items.',
    estSeconds: 26,
  },
  {
    key: 'verbal-17',
    category: 'deductive-reasoning',
    prompt:
      'Some editors are cyclists. All cyclists in this statement are swimmers. What must follow?',
    choices: [
      'All editors are swimmers',
      'Some editors are swimmers',
      'No editors are swimmers',
      'All swimmers are editors',
    ],
    correct: 1,
    explanation:
      'The editors who are cyclists must also be swimmers. This establishes some, not all, editors as swimmers.',
    estSeconds: 28,
  },
  {
    key: 'verbal-18',
    category: 'deductive-reasoning',
    prompt:
      'If a parcel is express, it receives a blue label. This parcel has a blue label. Is it necessarily express?',
    choices: [
      'Yes, always',
      'No, it cannot be express',
      'Cannot be determined',
      'Only if it is heavy',
    ],
    correct: 2,
    explanation:
      'Express implies a blue label, but other parcels may also receive blue labels. The implication cannot be reversed.',
    estSeconds: 28,
  },
  {
    key: 'verbal-19',
    category: 'deductive-reasoning',
    prompt:
      'Mina finished before Leon. Leon finished before Priya. Who finished first among these three?',
    choices: ['Mina', 'Leon', 'Priya', 'Cannot be determined'],
    correct: 0,
    explanation: 'The order is Mina, then Leon, then Priya. Chain the two before relationships.',
    estSeconds: 20,
  },
  {
    key: 'verbal-20',
    category: 'deductive-reasoning',
    prompt: 'Every certified guide passed the safety course. Arun did not pass it. What follows?',
    choices: [
      'Arun is a certified guide',
      'Arun never took the course',
      'Nobody is certified',
      'Arun is not a certified guide',
    ],
    correct: 3,
    explanation:
      'Passing is necessary for certification. Someone who did not pass cannot be a certified guide; whether Arun took the course is unknown.',
    estSeconds: 28,
  },
];
