/** Trusted geometric diagrams. No stored HTML or answer keys enter the renderer. */
interface Diagram {
  prompt: string;
  description: string;
  svg: string;
  choices: string[];
}
interface VisualQuestion {
  prompt: string;
  choices: string[];
}
const wrap = (body: string, width = 100, height = 100): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">${body}</svg>`;
const arrow = (turn: number): string =>
  `<path transform="rotate(${turn} 50 50)" d="M50 16 L76 44 H60 V84 H40 V44 H24 Z" fill="currentColor"/>`;
const triangle = (turn: number, filled: boolean): string =>
  `<path transform="rotate(${turn} 50 50)" d="M50 18 L80 78 H20 Z" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="4"/>`;
const circles = (count: number, filled: boolean): string =>
  Array.from(
    { length: count },
    (_, i) =>
      `<circle cx="${25 + (i % 3) * 25}" cy="${count <= 3 ? 50 : 34 + Math.floor(i / 3) * 32}" r="8" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="3"/>`,
  ).join('');
const corner = (index: number): string => {
  const points = [
    [22, 22],
    [78, 22],
    [78, 78],
    [22, 78],
    [50, 50],
  ];
  return `<rect x="12" y="12" width="76" height="76" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="${points[index][0]}" cy="${points[index][1]}" r="8" fill="currentColor"/>`;
};
const shape = (name: string): string =>
  name === 'circle'
    ? '<circle cx="50" cy="50" r="25" fill="none" stroke="currentColor" stroke-width="4"/>'
    : name === 'square'
      ? '<rect x="25" y="25" width="50" height="50" fill="none" stroke="currentColor" stroke-width="4"/>'
      : triangle(0, false);
const row = (names: string[]): string =>
  names.map((name, i) => `<g transform="translate(${i * 100} 0)">${shape(name)}</g>`).join('');
const sequence = (frames: string[]): string =>
  wrap(
    [
      ...frames,
      '<text x="50" y="65" text-anchor="middle" font-size="42" fill="currentColor">?</text>',
    ]
      .map(
        (frame, i) =>
          `<g transform="translate(${i * 110} 0)"><rect x="2" y="2" width="96" height="96" rx="8" fill="none" stroke="currentColor" opacity=".25"/>${frame}</g>`,
      )
      .join(''),
    (frames.length + 1) * 110,
    100,
  );

/** Return a diagram only for exact shipped wording/options; edited questions retain text. */
export function reasoningVisual(question: VisualQuestion): Diagram | null {
  const { prompt, choices } = question;
  let expected: string[];
  let diagram: Diagram;
  if (
    prompt ===
    '(Figure sequence described in words) The figure rotates 90° clockwise and grows. What moves?'
  ) {
    expected = ['Rotation only', 'Growth only', 'Both rotation and growth', 'Neither'];
    const frames = [0.4, 0.65, 0.9]
      .map(
        (scale, index) =>
          `<g transform="translate(${index * 110 + (1 - scale) * 50} ${(1 - scale) * 50}) scale(${scale})">${arrow(index * 90)}</g>`,
      )
      .join('');
    diagram = {
      prompt: 'What changes from one frame to the next?',
      description: 'Three arrows: small pointing up, medium pointing right, large pointing down.',
      svg: wrap(frames, 330, 100),
      choices: ['', '', '', ''],
    };
  } else if (
    prompt ===
    'An arrow points up, then right, then down, then left. With the same quarter-turn each step, where does it point next?'
  ) {
    expected = ['Left', 'Down', 'Right', 'Up'];
    diagram = {
      prompt: 'Which arrow comes next?',
      description: 'Arrow sequence: up, right, down, left, then a missing frame.',
      svg: sequence([0, 90, 180, 270].map(arrow)),
      choices: [270, 180, 90, 0].map((n) => wrap(arrow(n))),
    };
  } else if (
    prompt ===
    'Frames show 1 filled circle, 2 outline circles, 3 filled circles, 4 outline circles. Continue both patterns.'
  ) {
    expected = ['4 filled circles', '5 filled circles', '5 outline circles', '6 filled circles'];
    diagram = {
      prompt: 'Which frame completes both patterns?',
      description:
        'Frames: one filled circle; two outline circles; three filled circles; four outline circles; missing frame.',
      svg: sequence([circles(1, true), circles(2, false), circles(3, true), circles(4, false)]),
      choices: [circles(4, true), circles(5, true), circles(5, false), circles(6, true)].map((s) =>
        wrap(s),
      ),
    };
  } else if (
    prompt ===
    'A marker moves around four corners: top-left, top-right, bottom-right, bottom-left. Where is it next?'
  ) {
    expected = ['Top-right', 'Bottom-right', 'Top-left', 'Center'];
    diagram = {
      prompt: 'Where does the marker go next?',
      description:
        'Marker positions: top-left, top-right, bottom-right, bottom-left, then missing.',
      svg: sequence([0, 1, 2, 3].map(corner)),
      choices: [1, 2, 0, 4].map((n) => wrap(corner(n))),
    };
  } else if (
    prompt ===
    'A triangle points up and is black; then right and white; then down and black. With clockwise quarter-turns and alternating colors, what is next?'
  ) {
    expected = ['Left and white', 'Left and black', 'Up and white', 'Right and black'];
    diagram = {
      prompt: 'Which triangle comes next?',
      description:
        'Triangles: up and filled, right and outline, down and filled, then missing. Outline represents white; filled represents black.',
      svg: sequence([triangle(0, true), triangle(90, false), triangle(180, true)]),
      choices: [
        triangle(270, false),
        triangle(270, true),
        triangle(0, false),
        triangle(90, true),
      ].map((s) => wrap(s)),
    };
  } else if (
    prompt ===
    'A row shows [circle, square, triangle]. Each step moves the leftmost shape to the right end. What is the row after two steps?'
  ) {
    expected = [
      'square, triangle, circle',
      'circle, triangle, square',
      'triangle, square, circle',
      'triangle, circle, square',
    ];
    const grid =
      row(['circle', 'square', 'triangle']) +
      `<g transform="translate(0 100)">${row(['square', 'triangle', 'circle'])}</g>` +
      '<text x="150" y="260" text-anchor="middle" font-size="48" fill="currentColor">?</text>' +
      '<path d="M0 100 H300 M0 200 H300 M100 0 V200 M200 0 V200" stroke="currentColor" opacity=".25"/>';
    diagram = {
      prompt: 'Which row completes the pattern grid?',
      description:
        'Grid, read from left to right: first row circle, square, triangle; second row square, triangle, circle; third row missing.',
      svg: wrap(grid, 300, 300),
      choices: expected.map((s) => wrap(row(s.split(', ')), 300, 100)),
    };
  } else return null;
  return JSON.stringify(choices) === JSON.stringify(expected) ? diagram : null;
}
