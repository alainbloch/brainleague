/** Original practice material; estimates guide ordering, not validated difficulty. */
export interface PracticeQuestion {
  key: string;
  category: string;
  prompt: string;
  choices: string[];
  correct: number;
  explanation: string;
  estSeconds: number;
}

export interface PracticeTest {
  id: string;
  name: string;
  publisher: string;
  durationSeconds: number;
  questions: PracticeQuestion[];
}

export interface TutorialContent {
  category: string;
  slug: string;
  title: string;
  body: string;
  order: number;
}
