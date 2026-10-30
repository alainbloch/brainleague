import test from 'node:test';
import assert from 'node:assert/strict';
import nunjucks from 'nunjucks';
import { uiHelpers } from '../../src/ui/classes.js';

function views() {
  const env = nunjucks.configure('src/views', { autoescape: true });
  env.addGlobal('ui', { ...uiHelpers, icon: () => '' });
  return env;
}

test('question editor templates render both array and single-string form values', () => {
  const env = views();
  for (const name of ['admin/questions-new.njk', 'admin/questions-edit.njk']) {
    for (const choices of [['First', 'Second', 'Third'], 'Single answer']) {
      const html = env.render(name, {
        values: { choices },
        target: { id: 'q1' },
        tests: [],
        categories: [],
      });
      assert.ok(html.includes('name="choices"'));
      assert.ok(html.includes(Array.isArray(choices) ? 'value="First"' : 'value="Single answer"'));
    }
  }
});

test('settings password fields have unique IDs and labels target the correct inputs', () => {
  const html = views().render('settings.njk', {
    user: { id: 'u1', name: 'Alex', email: 'alex@example.com' },
    values: { name: 'Alex' },
  });
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(html.includes('for="email-current-password"'));
  assert.ok(html.includes('id="email-current-password" name="currentPassword"'));
  assert.ok(html.includes('id="currentPassword" name="currentPassword"'));
});
