import type { TutorialContent } from './types.js';

/** Plain text keeps admin-authored content escaped by the existing view. */
export const tutorials: TutorialContent[] = [
  {
    category: 'analogies',
    slug: 'analogies',
    title: 'Analogies: match the exact relationship',
    order: 1,
    body: `Name the relationship before reading the options. Turn the first pair into a short sentence, then keep the same direction for the second pair.

WORKED EXAMPLE
Thermometer : temperature :: stopwatch : ?
A) distance  B) time  C) weight  D) speed
1. A thermometer measures temperature.
2. A stopwatch measures time.
Answer: B. Speed involves time, but a stopwatch alone does not measure speed.

QUICK TIP
Look for part/whole, creator/work, tool/function, or cause/effect. A related word is not enough: both pairs must fit the same sentence.

COMMON TRAP
Reversing the relationship. Chapter : book is part to whole; book : chapter is whole to part.

TRY IT
Painter : painting :: composer : ?
A) concert hall  B) violin  C) symphony  D) audience

CHECK YOUR ANSWER
C, symphony. Both pairs connect a creator to a work. A violin is an instrument, not a composition.`,
  },
  {
    category: 'antonyms',
    slug: 'antonyms',
    title: 'Antonyms: define first, then reverse',
    order: 2,
    body: `Give the target a simple definition before choosing its opposite. Keep the meaning and part of speech aligned.

WORKED EXAMPLE
What is the opposite of reluctant?
A) hesitant  B) willing  C) unsure  D) cautious
1. Reluctant means unwilling or hesitant.
2. Reverse that meaning: willing.
Answer: B. Hesitant is a synonym, not an opposite.

QUICK TIP
If a word has several meanings, use the sense supported by the choices. Eliminate synonyms first; do not rely only on whether a word feels positive or negative.

COMMON TRAP
Choosing a merely different word. The opposite of concise is wordy, not inaccurate: a long answer can still be accurate.

TRY IT
What is the opposite of impartial?
A) fair  B) balanced  C) neutral  D) biased

CHECK YOUR ANSWER
D, biased. Impartial means not favoring a side; biased means favoring one.`,
  },
  {
    category: 'sentence-completion',
    slug: 'sentence-completion',
    title: 'Sentence completion: follow the evidence',
    order: 3,
    body: `Read the whole sentence. Predict a word, then compare the choices with that prediction.

WORKED EXAMPLE
Unlike her reckless teammate, Jo was _____ and checked each risk.
A) cautious  B) hasty  C) careless  D) impulsive
1. Unlike signals a contrast.
2. Checking each risk supports a careful approach.
Answer: A, cautious. The other choices repeat the teammate's recklessness.

QUICK TIP
But, although, and however often introduce contrast. Because and therefore connect a reason and a result. Use the actual evidence rather than inventing a backstory.

COMMON TRAP
A word may fit grammatically but contradict the clues. Change an initial answer when you find evidence against it; your first instinct is not a rule.

TRY IT
The explanation allowed two interpretations, so it was _____.
A) unambiguous  B) ambiguous  C) impossible  D) identical

CHECK YOUR ANSWER
B, ambiguous: open to more than one interpretation.`,
  },
  {
    category: 'arithmetic',
    slug: 'arithmetic',
    title: 'Arithmetic: percentages, fractions, and quick checks',
    order: 4,
    body: `Estimate first, calculate second, and check what the question actually asks for.

WORKED EXAMPLE 1: PERCENTAGES
Find 15% of 240.
10% = 24. 5% is half of 24 = 12. Therefore 15% = 36.
Useful building blocks: 50% = one half; 25% = one quarter; 10% = one tenth; 1% = one hundredth.

WORKED EXAMPLE 2: DISCOUNT
A $120 jacket has 25% off.
Discount = 120 / 4 = $30. Sale price = 120 - 30 = $90.
The discount amount and the price you pay are different answers.

WORKED EXAMPLE 3: FRACTIONS
Compare 3/8 and 2/5. Cross-multiply: 3 × 5 = 15; 2 × 8 = 16. Since 15 < 16, 3/8 is smaller. This comparison assumes positive denominators.

QUICK TIP
Multiply and divide before adding and subtracting. Estimate the size of the answer to catch misplaced decimals.

TRY IT
A score rises from 80 to 100. What is the percentage increase?

CHECK YOUR ANSWER
25%. The increase is 20; divide by the original 80: 20 / 80 = 1/4. Dividing by the new value gives the wrong base.`,
  },
  {
    category: 'word-problems',
    slug: 'word-problems',
    title: 'Word problems: turn the story into units',
    order: 5,
    body: `Write down the requested quantity and its unit. Translate the information into totals or rates before calculating.

WORKED EXAMPLE 1: CHANGING AN AVERAGE
Five trainees average 82 points. One with 90 leaves.
1. Total score = 5 × 82 = 410.
2. Remaining score = 410 - 90 = 320.
3. New average = 320 / 4 = 80.
Subtract the departing score from the total, not from the average.

WORKED EXAMPLE 2: A FREE ITEM
Six $3 notebooks on a buy-five-get-one-free offer cost $15 altogether. Average cost per notebook = $15 / 6 = $2.50. Divide by the number received, not the number paid for.

QUICK TIP
Per usually means division. Twice means multiply by two. For work-rate questions, add or subtract the amount done per hour, not the completion times.

TRY IT
Four scores average 21. Three scores are 18, 20, and 22. Find the fourth.

CHECK YOUR ANSWER
24. Total = 4 × 21 = 84. Known total = 60. Missing score = 84 - 60.`,
  },
  {
    category: 'number-series',
    slug: 'number-series',
    title: 'Number series: differences, ratios, and alternating rules',
    order: 6,
    body: `Try simple rules in order: constant difference, constant ratio, changing differences, then alternating positions. Check your rule against every displayed step.

WORKED EXAMPLE 1
2, 6, 12, 20, 30, ?
Differences: +4, +6, +8, +10. They rise by 2, so the next difference is +12. Answer: 42.

WORKED EXAMPLE 2
3, 7, 15, 31, ?
Each step doubles and adds 1: 3 × 2 + 1 = 7; 7 × 2 + 1 = 15. Next: 31 × 2 + 1 = 63.

WORKED EXAMPLE 3
2, 10, 4, 20, 6, 30, ?
Odd positions: 2, 4, 6. Even positions: 10, 20, 30. The next odd-position value is 8.

COMMON TRAP
A rule that fits only the final pair is not enough. Finite sequences can admit many rules; prefer the simple consistent rule supported by the choices.

TRY IT
5, 9, 17, 33, ?

CHECK YOUR ANSWER
65. Differences double: 4, 8, 16, then 32. Equivalently, double each term and subtract 1.`,
  },
  {
    category: 'odd-one-out',
    slug: 'odd-one-out',
    title: 'Odd one out: state a testable rule',
    order: 7,
    body: `Find one clear property shared by three choices but not the fourth. If the prompt names a property, use that property.

WORKED EXAMPLE
Which number is not a perfect square: 16, 18, 25, 36?
16 = 4², 25 = 5², and 36 = 6². Answer: 18.
Odd/even would not separate one item here: two are odd and two are even.

QUICK TIP
Check category, number of sides, divisibility, or a named measurement. Verify all three members of the group before selecting the exception.

COMMON TRAP
Selecting a superficial difference such as word length when the question explicitly asks about units of measurement. If the intended category is unclear, avoid inventing a complicated rule.

TRY IT
Which is not a unit of time: second, minute, meter, hour?

CHECK YOUR ANSWER
Meter. It measures length; the other three measure time.`,
  },
  {
    category: 'figure-series',
    slug: 'figure-series',
    title: 'Figure series: track one feature at a time',
    order: 8,
    body: `Track direction, count, fill, and position separately. These practice exercises describe figures in words so you can follow every transformation without an image.

WORKED EXAMPLE 1: ROTATION
An arrow points up, right, down, left. It turns 90° clockwise each time. Next: up. Four quarter-turns complete one full turn.

WORKED EXAMPLE 2: TWO CHANGES
Frames show 1 filled circle, 2 outline circles, 3 filled circles, 4 outline circles.
Count: add one each time. Fill: alternate filled and outline.
Next: 5 filled circles. Checking only the count would leave two plausible options.

COMMON TRAP
Reflection is not rotation. A mirror reverses an arrangement across an axis; a rotation turns it around a point.

TRY IT
A triangle is up/black, then right/white, then down/black. Continue clockwise quarter-turns and alternating colors.

CHECK YOUR ANSWER
Left/white. Direction and fill each advance one step independently.`,
  },
  {
    category: 'deductive-reasoning',
    slug: 'deductive-reasoning',
    title: 'Deduction: must be true versus might be true',
    order: 9,
    body: `Use only the premises. A conclusion must follow in every situation that satisfies them, not merely sound plausible.

WORKED EXAMPLE 1: GROUPS
Some editors are cyclists. All those cyclists are swimmers.
The editors who are cyclists are also swimmers. Therefore some editors are swimmers. You cannot conclude that all editors swim.

WORKED EXAMPLE 2: ONE-WAY RULE
If a parcel is express, it gets a blue label. A parcel has a blue label.
You cannot conclude it is express: other parcels might get blue labels too. If it has no blue label, however, it cannot be express under this rule.

QUICK TIP
All A are B does not mean all B are A. Some means at least one, not necessarily most. Do not assume a group exists just because a statement says all its members have a property.

TRY IT
All certified guides passed a course. Mira did not pass. Can Mira be a certified guide?

CHECK YOUR ANSWER
No. Passing is a necessary condition for certification. This does not tell you whether Mira attempted the course.`,
  },
  {
    category: 'word-problems',
    slug: 'rates-and-average-speed',
    title: 'Rates: pumps, shared work, and average speed',
    order: 10,
    body: `Convert completion times to work per unit of time. For a task taking T hours at a constant rate, the rate is 1/T of the task per hour.

WORKED EXAMPLE 1: PUMP AND LEAK
A pump fills a tank in 4 hours; a leak empties it in 12 hours.
Choose a convenient 12-unit tank. Pump: 3 units/hour. Leak: 1 unit/hour. Net: 2 units/hour. Fill time: 12 / 2 = 6 hours.
Check: a leak must make filling slower than 4 hours. These exercises assume both rates stay constant.

WORKED EXAMPLE 2: TWO PRINTERS
One printer takes 12 minutes; another takes 6. Combined rate = 1/12 + 1/6 = 1/4 job per minute. Together they take 4 minutes, less than either alone.

WORKED EXAMPLE 3: AVERAGE SPEED
120 miles at 60 mph takes 2 hours. Another 120 miles at 40 mph takes 3 hours. Average speed = total distance / total time = 240 / 5 = 48 mph.
Do not average speeds unless the time spent at each speed is equal.

TRY IT
A pump fills in 6 hours and a leak empties in 18. Find the combined filling time.

CHECK YOUR ANSWER
9 hours. Using an 18-unit tank: 3 - 1 = 2 units/hour, so 18 / 2 = 9.`,
  },
  {
    category: 'arithmetic',
    slug: 'percentage-changes',
    title: 'Percentage changes: choose the right base',
    order: 11,
    body: `Percentage change = (new - original) / original × 100. For successive changes, multiply the change factors.

WORKED EXAMPLE 1: UP THEN DOWN
Start with 100. A 20% rise gives 120. A subsequent 20% fall removes 24, leaving 96. Overall change: a 4% decrease.
Shortcut: 1.20 × 0.80 = 0.96. Equal percentage rises and falls do not cancel because their bases differ.

WORKED EXAMPLE 2: PER EMPLOYEE
Sales rise 20% and staff rises 50%. Sales per employee changes by 1.20 / 1.50 = 0.80, a 20% decrease. Divide the factors; do not subtract the percentages.

WORKED EXAMPLE 3: PROFIT
Cost $60, selling price $75: profit is $15.
Profit as a percentage of cost = 15 / 60 = 25%.
Profit margin as a percentage of sales = 15 / 75 = 20%.
Read which base the question asks for.

TRY IT
A quantity rises by 25%, then falls by 20%. What is the net change?

CHECK YOUR ANSWER
No change: 1.25 × 0.80 = 1. The starting value of 100 becomes 125, then returns to 100.`,
  },
  {
    category: 'word-problems',
    slug: 'timed-practice-strategy',
    title: 'Timed practice: pace, review, and improve',
    order: 12,
    body: `Start with accurate untimed practice, then add time pressure. BrainLeague exercises are original practice material; these scores are not validated IQ scores or official employer assessment results.

WORKED EXAMPLE: A TIME BUDGET
For 20 questions in 10 minutes, the average budget is 600 / 20 = 30 seconds. A 15-second question leaves time for a longer one. Treat the average as a guide, not a requirement for every question.

DURING A TEST
Read the requested unit. Estimate. Eliminate impossible options. If you have no workable approach after a reasonable attempt, decide whether to guess or skip and move on. BrainLeague gives no negative marks for wrong answers, but skipping leaves the question unanswered. Its current tests do not let you go back, so make the decision before moving forward. Other tests may have different rules.

AFTER A TEST
Read each explanation. Label the mistake: unfamiliar method, misread wording, calculation slip, or too much time spent. Work through the linked tutorial, then solve a fresh problem using the same method.

TRY IT
You spend 90 seconds on one problem in a 20-question, 10-minute test. How much of the average question budget did it use?

CHECK YOUR ANSWER
Three average question budgets: 90 / 30 = 3. This is a cue to review your method, not proof that spending extra time was always wrong.

PRACTICE PLAN
Choose one focused workout. Review two missed questions carefully. Explain the method without looking at the answer. On the next session, track both accuracy and time; repeated questions can improve recall without demonstrating transfer to new problems.`,
  },
];
