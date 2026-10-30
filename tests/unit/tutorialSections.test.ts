import test from 'node:test';
import assert from 'node:assert/strict';
import nunjucks from 'nunjucks';
import { tutorialSections } from '../../src/ui/tutorialSections.js';

test('lessons preserve content while recognizing standalone section headings', () => {
  const sections = tutorialSections(
    'Intro\r\n\r\nWORKED EXAMPLE\r\n1. Add 2.\r\n2. Divide.\r\nQUICK TIP\r\nTry it.\r\nCHECK YOUR ANSWER\r\n4',
  );
  assert.deepEqual(
    sections.map((s) => s.tone),
    ['intro', 'example', 'tip', 'answer'],
  );
  assert.equal(sections[1].text, '1. Add 2.\n2. Divide.');
  assert.equal(sections[3].text, '4');
  assert.deepEqual(tutorialSections(''), []);
  assert.equal(tutorialSections('A QUICK TIP is useful.')[0].text, 'A QUICK TIP is useful.');
});

test('tutorial rendering escapes admin HTML in both visible text and answer reveals', () => {
  const env = nunjucks.configure('src/views', { autoescape: true });
  env.addGlobal('ui', { tutorialSections, buttonClass: () => '' });
  const html = env.render('tutorial.njk', {
    tutorial: {
      title: '<b>Lesson</b>',
      categorySlug: 'numbers',
      body: 'QUICK TIP\n<script>alert(1)</script>\nCHECK YOUR ANSWER\n<img src=x onerror=alert(1)>',
    },
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('<details'));
  assert.ok(html.includes('&lt;b&gt;Lesson&lt;/b&gt;'));
});
