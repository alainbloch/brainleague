import type { PracticeQuestion } from './types.js';

export const numericalQuestions: PracticeQuestion[] = [
  {
    key: 'numerical-01',
    category: 'arithmetic',
    prompt: 'What is 15% of 240?',
    choices: ['24', '30', '36', '48'],
    correct: 2,
    explanation: '10% is 24 and 5% is half of that, 12. Add them: 24 + 12 = 36.',
    estSeconds: 18,
  },
  {
    key: 'numerical-02',
    category: 'arithmetic',
    prompt: 'A $120 jacket is reduced by 25%. What is its sale price?',
    choices: ['$30', '$95', '$100', '$90'],
    correct: 3,
    explanation:
      'A 25% discount is one quarter: 120 / 4 = 30. Pay 120 - 30 = $90, not the discount amount.',
    estSeconds: 20,
  },
  {
    key: 'numerical-03',
    category: 'arithmetic',
    prompt: 'A price rises by 20% and then falls by 20%. What is the net change?',
    choices: ['4% decrease', 'No change', '4% increase', '40% decrease'],
    correct: 0,
    explanation:
      'Use a starting price of 100: 100 × 1.2 × 0.8 = 96. The second percentage uses the new base.',
    estSeconds: 28,
  },
  {
    key: 'numerical-04',
    category: 'arithmetic',
    prompt:
      'A shop buys an item for $60 and sells it for $75. What is the profit as a percentage of cost?',
    choices: ['15%', '20%', '25%', '125%'],
    correct: 2,
    explanation:
      'Profit = 75 - 60 = 15. Divide by cost: 15 / 60 × 100 = 25%. Dividing by selling price would give margin instead.',
    estSeconds: 25,
  },
  {
    key: 'numerical-05',
    category: 'arithmetic',
    prompt: 'Which fraction is smallest?',
    choices: ['3/8', '2/5', '5/12', '7/16'],
    correct: 0,
    explanation: 'Convert or compare: 3/8 = 0.375, 2/5 = 0.4, 5/12 ≈ 0.417, 7/16 = 0.4375.',
    estSeconds: 24,
  },
  {
    key: 'numerical-06',
    category: 'arithmetic',
    prompt: 'Evaluate 18 - 3 × 4 + 8 / 2.',
    choices: ['64', '16', '40', '10'],
    correct: 3,
    explanation:
      'Multiply and divide first: 18 - 12 + 4 = 10. Then add and subtract from left to right.',
    estSeconds: 18,
  },
  {
    key: 'numerical-07',
    category: 'arithmetic',
    prompt:
      'The ratio of red to blue counters is 3:5. There are 40 counters altogether. How many are red?',
    choices: ['24', '15', '8', '25'],
    correct: 1,
    explanation:
      'There are 3 + 5 = 8 equal parts. Each is 40 / 8 = 5 counters. Red has 3 × 5 = 15.',
    estSeconds: 24,
  },
  {
    key: 'numerical-08',
    category: 'arithmetic',
    prompt: 'A score increases from 64 to 80. What is the percentage increase?',
    choices: ['16%', '20%', '25%', '80%'],
    correct: 2,
    explanation: 'The increase is 16. Use the original score as the base: 16 / 64 × 100 = 25%.',
    estSeconds: 22,
  },
  {
    key: 'numerical-09',
    category: 'word-problems',
    prompt:
      'Five trainees average 82 points. A trainee who scored 90 leaves. What is the remaining average?',
    choices: ['80', '82', '84', '72'],
    correct: 0,
    explanation:
      'Original total = 5 × 82 = 410. Remaining total = 410 - 90 = 320. Divide by 4 to get 80.',
    estSeconds: 30,
  },
  {
    key: 'numerical-10',
    category: 'word-problems',
    prompt:
      'Six notebooks normally cost $3 each. With buy five, get one free, what is the average cost per notebook when you take six?',
    choices: ['$3.00', '$2.00', '$2.75', '$2.50'],
    correct: 3,
    explanation:
      'You pay for five: 5 × $3 = $15. Spread that cost over all six notebooks: 15 / 6 = $2.50.',
    estSeconds: 24,
  },
  {
    key: 'numerical-11',
    category: 'word-problems',
    prompt:
      'A pump fills a tank in 4 hours. A leak empties a full tank in 12 hours. Starting empty, how long does filling take with both running at constant rates?',
    choices: ['8 hours', '6 hours', '3 hours', '16 hours'],
    correct: 1,
    explanation:
      'Use a 12-unit tank. The pump adds 3 units/hour and the leak removes 1. Net 2 units/hour fills 12 units in 6 hours.',
    estSeconds: 40,
  },
  {
    key: 'numerical-12',
    category: 'word-problems',
    prompt:
      'Printer A completes a job in 12 minutes and printer B in 6 minutes. At constant independent rates, how long do they take together?',
    choices: ['18 minutes', '6 minutes', '4 minutes', '3 minutes'],
    correct: 2,
    explanation: 'Combined rate = 1/12 + 1/6 = 3/12 = 1/4 job per minute. One job takes 4 minutes.',
    estSeconds: 32,
  },
  {
    key: 'numerical-13',
    category: 'word-problems',
    prompt:
      'A driver travels 120 miles at 60 mph, then 120 miles at 40 mph. What is the average speed?',
    choices: ['48 mph', '50 mph', '45 mph', '52 mph'],
    correct: 0,
    explanation:
      'Total distance is 240 miles. Times are 2 and 3 hours. Average speed = 240 / 5 = 48 mph, not the mean of the speeds.',
    estSeconds: 36,
  },
  {
    key: 'numerical-14',
    category: 'word-problems',
    prompt:
      'How much water must be added to 30 liters of a 20% salt solution to make a 12% solution?',
    choices: ['10 liters', '12 liters', '18 liters', '20 liters'],
    correct: 3,
    explanation:
      'Salt stays at 30 × 0.20 = 6 liters. Final volume must be 6 / 0.12 = 50 liters. Add 50 - 30 = 20 liters of water.',
    estSeconds: 40,
  },
  {
    key: 'numerical-15',
    category: 'word-problems',
    prompt:
      'A cyclist leaves at 9:00 at 12 mph. Another leaves the same point at 9:30 at 18 mph in the same direction. At what time does the second catch up?',
    choices: ['10:00', '10:30', '11:00', '11:30'],
    correct: 1,
    explanation:
      'The first cyclist has a 6-mile lead. Closing speed is 18 - 12 = 6 mph. Catch-up takes 1 hour after 9:30: 10:30.',
    estSeconds: 38,
  },
  {
    key: 'numerical-16',
    category: 'word-problems',
    prompt:
      'Eight identical machines make 240 parts in 3 hours. At the same rate, how many parts do five machines make in 4 hours?',
    choices: ['160', '180', '200', '300'],
    correct: 2,
    explanation:
      'Each machine makes 240 / (8 × 3) = 10 parts per hour. Five machines for four hours make 5 × 4 × 10 = 200.',
    estSeconds: 32,
  },
  {
    key: 'numerical-17',
    category: 'word-problems',
    prompt:
      'Sales rise by 20% while employee count rises by 50%. How does sales per employee change?',
    choices: ['20% decrease', '30% decrease', '20% increase', '30% increase'],
    correct: 0,
    explanation:
      'Divide the factors: 1.20 / 1.50 = 0.80. Each employee accounts for 80% of the previous sales per employee, a 20% decrease.',
    estSeconds: 38,
  },
  {
    key: 'numerical-18',
    category: 'arithmetic',
    prompt: 'Solve 3x + 7 = 28.',
    choices: ['5', '6', '9', '7'],
    correct: 3,
    explanation: 'Subtract 7 from both sides: 3x = 21. Divide by 3: x = 7. Check: 3 × 7 + 7 = 28.',
    estSeconds: 20,
  },
  {
    key: 'numerical-19',
    category: 'arithmetic',
    prompt:
      'A bag has 3 red and 5 blue balls. One ball is picked at random, with each equally likely. What is the probability it is red?',
    choices: ['3/5', '3/8', '5/8', '1/3'],
    correct: 1,
    explanation:
      'There are 8 equally likely balls and 3 are red. Probability = favorable outcomes / total outcomes = 3/8.',
    estSeconds: 20,
  },
  {
    key: 'numerical-20',
    category: 'word-problems',
    prompt: 'Three numbers have an average of 18. Two are 12 and 20. What is the third?',
    choices: ['16', '18', '22', '24'],
    correct: 2,
    explanation: 'The total is 3 × 18 = 54. Subtract the known values: 54 - 12 - 20 = 22.',
    estSeconds: 24,
  },
];
