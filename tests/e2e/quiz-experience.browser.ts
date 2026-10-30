import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import type { Environment } from 'nunjucks';
import { buildApp } from '../../src/app.js';
import { createTestContainer } from '../helpers.js';
import { practiceTests } from '../../scripts/content/catalog.js';
import { reasoningVisual } from '../../src/ui/reasoningVisuals.js';

let browser: Browser;
const { container } = createTestContainer();
const app = await buildApp({ container });
const figures = practiceTests[3].questions.filter((q) => q.category === 'figure-series');
const questions = [figures[4], figures[0], figures[1]].map((q, i) => ({
  ...q,
  id: `q${i}`,
  categorySlug: q.category,
  visual: reasoningVisual(q),
}));

before(async () => {
  await app.ready();
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ['--no-sandbox'],
  });
});
after(async () => {
  await browser?.close();
  await app.close();
  container.close();
});

async function fixture(page: Page) {
  const submissions: Array<Array<{ questionId: string; chosenIndex: number | null }>> = [];
  const saves: unknown[] = [];
  const now = Date.now();
  const html = app.getDecorator<Environment>('viewEngine').render('quizzes/take.njk', {
    pageTitle: 'Test',
    questions,
    attemptId: 'browser-attempt',
    deadlineMs: now + 600000,
    serverNow: now,
  });
  await page.route('http://brainleague.test/**', async (route) => {
    const request = route.request();
    if (request.url().endsWith('/submit')) {
      submissions.push(JSON.parse(new URLSearchParams(request.postData() ?? '').get('answers')!));
      await route.fulfill({ contentType: 'text/html', body: '<h1>Saved</h1>' });
    } else if (request.url().endsWith('/progress')) {
      saves.push(JSON.parse(new URLSearchParams(request.postData() ?? '').get('answers')!));
      await route.fulfill({ status: 204 });
    } else if (request.url().endsWith('.css')) {
      await route.fulfill({
        contentType: 'text/css',
        body: readFileSync('src/public/assets/css/app.min.css', 'utf8'),
      });
    } else if (request.url().endsWith('.svg')) {
      const name = new URL(request.url()).pathname.split('/').pop();
      await route.fulfill({
        contentType: 'image/svg+xml',
        body: readFileSync(`src/public/assets/images/${name}`, 'utf8'),
      });
    } else if (request.url().endsWith('/take')) {
      await route.fulfill({ contentType: 'text/html', body: html });
    } else await route.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://brainleague.test/take');
  return { submissions, saves };
}

test('keyboard selects without advancing, Enter commits, and Skip works after the first question', async () => {
  const page = await browser.newPage();
  try {
    const { submissions, saves } = await fixture(page);
    await page.keyboard.press('1');
    assert.equal(
      await page.locator('.question-view:visible .choice[aria-pressed="true"]').count(),
      1,
    );
    assert.equal(await page.locator('#progress-current').textContent(), '1');
    await page.keyboard.press('4');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#progress-current').textContent(), '2');
    assert.equal(await page.locator('#next-btn').isDisabled(), true);
    await page.locator('#skip-btn').click();
    assert.equal(await page.locator('#progress-current').textContent(), '3');
    await page.locator('.question-view:visible .choice').nth(1).click();
    await page.locator('#next-btn').click();
    await page.waitForURL('**/submit');
    assert.equal(submissions.length, 1);
    assert.deepEqual(
      submissions[0].map((a) => [a.questionId, a.chosenIndex]),
      [
        ['q0', 3],
        ['q1', null],
        ['q2', 1],
      ],
    );
    assert.ok(saves.length > 0, 'committed answers are autosaved');
  } finally {
    await page.close();
  }
});

test('held keys do not commit twice and timeout submits exactly once', async () => {
  const page = await browser.newPage();
  try {
    await page.clock.install();
    const { submissions } = await fixture(page);
    await page.keyboard.down('1');
    await page.keyboard.down('1');
    await page.keyboard.up('1');
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    assert.equal(await page.locator('#progress-current').textContent(), '2');
    await page.clock.fastForward(600001);
    await page.waitForURL('**/submit');
    assert.equal(submissions.length, 1);
    assert.equal(submissions[0].length, 2);
    assert.equal(submissions[0][1].chosenIndex, null);
  } finally {
    await page.close();
  }
});

test('answer cards and pattern grid fit narrow mobile and desktop screens', async () => {
  const page = await browser.newPage();
  try {
    await fixture(page);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(
        'document.documentElement.scrollWidth > window.innerWidth',
      );
      assert.equal(overflow, false, `horizontal overflow at ${width}px`);
      const card = await page.locator('.question-view:visible .choice').first().boundingBox();
      assert.ok(card && card.height >= 64);
      assert.equal(await page.locator('.question-view:visible figure[role="img"] svg').count(), 1);
    }
    await page.setViewportSize({ width: 390, height: 1000 });
    if (process.env.QUIZ_SCREENSHOT)
      await page.screenshot({ path: process.env.QUIZ_SCREENSHOT, fullPage: true });
  } finally {
    await page.close();
  }
});
