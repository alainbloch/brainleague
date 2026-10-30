/** Presentation-only structure for plain-text lessons. Text stays escaped by Nunjucks. */
export interface TutorialSection {
  title: string;
  tone: 'intro' | 'example' | 'tip' | 'trap' | 'practice' | 'answer';
  text: string;
}

const headings: Record<string, Omit<TutorialSection, 'text'>> = {
  'WORKED EXAMPLE': { title: 'Worked example', tone: 'example' },
  'QUICK TIP': { title: 'Quick tip', tone: 'tip' },
  'COMMON TRAP': { title: 'Watch out for', tone: 'trap' },
  'TRY IT': { title: 'Your turn', tone: 'practice' },
  'CHECK YOUR ANSWER': { title: 'Check your answer', tone: 'answer' },
};

/** Split recognized standalone headings; preserve arbitrary admin text without interpreting HTML. */
export function tutorialSections(body: string): TutorialSection[] {
  const sections: TutorialSection[] = [];
  let current: TutorialSection = { title: 'The idea', tone: 'intro', text: '' };
  for (const line of String(body ?? '').split(/\r?\n/)) {
    const heading = headings[line.trim()];
    if (heading) {
      if (current.text.trim()) sections.push({ ...current, text: current.text.trim() });
      current = { ...heading, text: '' };
    } else {
      current.text += `${line}\n`;
    }
  }
  if (current.text.trim()) sections.push({ ...current, text: current.text.trim() });
  return sections;
}
