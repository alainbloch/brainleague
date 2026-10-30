/**
 * Optional seed: creates an admin account, a verified demo account, and a batch
 * of demo users with a few sample friendships + notifications, so every social
 * feature and the admin pages have data to show immediately.
 *
 * Idempotent: seeded accounts are created only if their emails are unused.
 *
 * Env: SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD (admin@example.test /
 * Admin-pass-123!), SEED_EMAIL/SEED_PASSWORD (demo@example.test /
 * Change-me-123!), SEED_COUNT (default 12 demo users).
 * Usage: node scripts/seed.js
 */
import { buildContainer } from '../src/container.js';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@example.test';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin-pass-123!';
const DEMO_EMAIL = process.env.SEED_EMAIL || 'demo@example.test';
const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'Change-me-123!';
const DEMO_COUNT = Math.min(
  50,
  Math.max(1, Number.parseInt(process.env.SEED_COUNT || '', 10) || 12),
);

const FIRST_NAMES = [
  'Ada',
  'Grace',
  'Alan',
  'Radia',
  'Margaret',
  'Linus',
  'Edsger',
  'Barbara',
  'Donald',
  'Katherine',
  'John',
  'Anita',
];
const LAST_NAMES = [
  'Lovelace',
  'Hopper',
  'Turing',
  'Perlman',
  'Hamilton',
  'Torvalds',
  'Dijkstra',
  'Liskov',
  'Knuth',
  'Johnson',
  'Backus',
  'Borg',
];

function demoUser(i: number): { name: string; email: string; password: string } {
  const name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[i % LAST_NAMES.length]}`;
  return {
    name,
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.test`,
    password: DEMO_PASSWORD,
  };
}

const container = buildContainer();
const { identity, friendships, notifications } = container.services;

/** Create an account unless its email already exists. */
function ensureUser({
  name,
  email,
  password,
  role = 'user',
}: {
  name: string;
  email: string;
  password: string;
  role?: 'admin' | 'user';
}) {
  const existing = container.repos.users.findByEmail(email);
  if (existing) return existing;
  const user = identity.createVerifiedUser({ name, email, password, role: role ?? 'user' });
  console.log(`Seed: created ${role === 'admin' ? 'admin ' : ''}${user.email}`);
  return user;
}

try {
  const admin = ensureUser({
    name: 'Site Admin',
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: 'admin',
  });
  const demo = ensureUser({ name: 'Demo User', email: DEMO_EMAIL, password: DEMO_PASSWORD });

  // All 12 named demo users (distinct from the demo account above).
  const users = [admin, demo];
  for (let i = 0; i < DEMO_COUNT; i++) {
    users.push(ensureUser(demoUser(i)));
  }

  // A few sample friendships (accepted) and one pending request toward demo,
  // plus notifications, so the inbox/badges are not empty. Users are located
  // by email so re-running the seed never relies on array ordering.
  const byEmail = new Map(users.map((u) => [u.email, u]));
  const friend1 = byEmail.get(demoUser(0).email); // Ada Lovelace
  const friend2 = byEmail.get(demoUser(1).email); // Grace Hopper
  if (friend1 && friend2 && demo?.id) {
    const s1 = container.services.friendships.statusBetween(demo.id, friend1.id);
    if (s1 === 'none') {
      await friendships.request(demo.id, friend1.id);
      await friendships.accept(friend1.id, demo.id);
    }
    const s2 = container.services.friendships.statusBetween(demo.id, friend2.id);
    if (s2 === 'none') {
      await friendships.request(friend2.id, demo.id); // pending request TO demo
    }
  }
  if (demo?.id)
    await notifications.notify({
      userId: demo.id,
      type: 'system',
      payload: { message: 'Welcome! Manage your profile and reach out to other users.' },
    });

  console.log(
    `\nSeed complete. Sign in as:\n` +
      `  Admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}\n` +
      `  User:  ${DEMO_EMAIL} / ${DEMO_PASSWORD}\n` +
      `${users.length} accounts total.`,
  );
} finally {
  container.close();
}
