import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

/**
 * End-to-end: boot the real server process against a fresh on-disk database,
 * then drive the critical sign-in journey over real HTTP. This verifies
 * migrations, static serving, the session cookie, and the console mail transport
 * together exactly as the deployed app behaves.
 */
const PORT = 4123;
const APP_URL = `http://localhost:${PORT}`;
const EMAIL = 'e2e@example.com';

let proc: ChildProcess | undefined;
let tmpDir: string;
let stdout = '';

function magicLink(purpose: 'reset' | 'verify'): string | null {
  const linkPath = purpose === 'reset' ? 'auth/reset' : 'auth/verify';
  const re = new RegExp(`Link: ${APP_URL}/${linkPath}\\?token=([a-f0-9]{64})&email=[^\\s]+`);
  const match = stdout.match(re);
  if (!match) return null;
  return `${APP_URL}/${linkPath}?token=${match[1]}&email=${encodeURIComponent(EMAIL)}`;
}

async function http(
  url: string,
  {
    method = 'GET',
    cookie = '',
    form,
  }: { method?: string; cookie?: string; form?: Record<string, string> } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  let body: string | undefined;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }
  return fetch(url, { method, headers, body, redirect: 'manual' });
}

function sessionCookie(res: Response): string {
  const setCookie = res.headers.get('set-cookie');
  return setCookie ? setCookie.split(';')[0] : '';
}

async function waitFor<T>(condition: () => T | null, timeoutMs = 5000): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = condition();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

before(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'usertest-e2e-'));
  // Boot the TypeScript entry point through the tsx loader exactly as dev runs it.
  proc = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      MAIL_TRANSPORT: 'console',
      PORT: String(PORT),
      APP_URL,
      DATABASE_PATH: path.join(tmpDir, 'app.db'),
      SESSION_SECRET: 'test-secret-for-e2e',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout?.on('data', (d: Buffer) => (stdout += d));
  proc.stderr?.on('data', (d: Buffer) => (stdout += d));

  // Wait for readiness.
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${APP_URL}/health`);
      if (res.status === 200) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.fail(`Server did not become ready. Log:\n${stdout}`);
});

after(() => {
  if (proc && proc.pid) proc.kill('SIGTERM');
  rmSync(tmpDir, { recursive: true, force: true });
});

test('health, assets and public pages work', async () => {
  const health = await fetch(`${APP_URL}/health`);
  assert.equal(health.status, 200);
  const css = await fetch(`${APP_URL}/assets/css/app.min.css`);
  assert.equal(css.status, 200);
  const index = await fetch(`${APP_URL}/`);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /Brain League/);
});

test('console register → sign in → protected page → logout', async () => {
  // Register
  const reg = await http(`${APP_URL}/register`, {
    method: 'POST',
    form: { name: 'E2E', email: EMAIL, password: 'Correct-Horse-42!' },
  });
  assert.equal(reg.status, 200);
  assert.match(await reg.text(), /Email confirmation is not required/);
  assert.equal(magicLink('verify'), null, 'no verification link needed in console mode');

  const login = await http(`${APP_URL}/login`, {
    method: 'POST',
    form: { email: EMAIL, password: 'Correct-Horse-42!' },
  });
  assert.equal(login.status, 302);
  const cookie = sessionCookie(login);
  assert.ok(cookie.startsWith('usertest_session'), 'session cookie set after login');

  // Protected page accessible with the cookie.
  const account = await http(`${APP_URL}/account`, { cookie });
  assert.equal(account.status, 200);
  assert.match(await account.text(), /e2e@example\.com/);

  // Logout clears the session.
  const logout = await http(`${APP_URL}/logout`, { method: 'GET', cookie });
  assert.equal(logout.status, 302);
  const afterLogout = await http(`${APP_URL}/account`, { cookie });
  assert.equal(afterLogout.status, 302, 'cookie no longer authorizes after logout');
  assert.match(afterLogout.headers.get('location') || '', /\/login/);
});

test('password reset journey works and old session is revoked', async () => {
  const goodLogin = await http(`${APP_URL}/login`, {
    method: 'POST',
    form: { email: EMAIL, password: 'Correct-Horse-42!' },
  });
  assert.equal(goodLogin.status, 302);
  const cookie = sessionCookie(goodLogin);
  assert.ok(cookie.startsWith('usertest_session'));

  // Request a reset link (console transport).
  const forgot = await http(`${APP_URL}/auth/forgot`, {
    method: 'POST',
    form: { email: EMAIL },
  });
  assert.equal(forgot.status, 200);
  const resetUrl = await waitFor(() => magicLink('reset'));
  assert.ok(resetUrl, `reset link logged:\n${stdout}`);

  // Reset the password. The reset link carries token/email query params; the
  // form posts to the base /auth/reset path.
  const reset = await http(`${APP_URL}/auth/reset`, {
    method: 'POST',
    form: {
      token: new URL(resetUrl).searchParams.get('token') || '',
      email: EMAIL,
      password: 'Brand-New-Pass-1!',
      passwordConfirm: 'Brand-New-Pass-1!',
    },
  });
  assert.equal(reset.status, 200);
  assert.match(await reset.text(), /Password updated/);

  // Pre-reset session was revoked.
  const revoked = await http(`${APP_URL}/account`, { cookie });
  assert.equal(revoked.status, 302, 'old session revoked after password change');

  // New password works; old one does not.
  const newLogin = await http(`${APP_URL}/login`, {
    method: 'POST',
    form: { email: EMAIL, password: 'Brand-New-Pass-1!' },
  });
  assert.equal(newLogin.status, 302);
  const bad = await http(`${APP_URL}/login`, {
    method: 'POST',
    form: { email: EMAIL, password: 'Correct-Horse-42!' },
  });
  assert.equal(bad.status, 401);
});

test('anonymous visitors cannot reach the protected page', async () => {
  const res = await http(`${APP_URL}/account`);
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location') || '', /\/login/);
});
