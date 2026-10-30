import config, { type AppConfig } from './config.js';
import { openDatabase, closeDatabase } from './models/database.js';
import { UsersRepository } from './models/usersRepository.js';
import { SessionsRepository } from './models/sessionsRepository.js';
import { TokensRepository } from './models/tokensRepository.js';
import { RateLimitsRepository } from './models/rateLimitsRepository.js';
import { EmailChangesRepository } from './models/emailChangesRepository.js';
import { FriendshipsRepository } from './models/friendshipsRepository.js';
import { NotificationsRepository } from './models/notificationsRepository.js';
import { TestsRepository } from './models/testsRepository.js';
import { QuestionsRepository } from './models/questionsRepository.js';
import { AttemptsRepository } from './models/attemptsRepository.js';
import { SessionService } from './services/sessionService.js';
import { TokenService } from './services/tokenService.js';
import { RateLimitService } from './services/rateLimitService.js';
import { MailService } from './services/mailService.js';
import { IdentityService } from './services/identityService.js';
import { AvatarStorage } from './services/avatarStorage.js';
import { FriendshipService } from './services/friendshipService.js';
import { NotificationService } from './services/notificationService.js';
import { DirectoryService } from './services/directoryService.js';
import { AdminService } from './services/adminService.js';
import { QuizEngine } from './services/quizEngine.js';

export interface ContainerServices {
  sessions: SessionService;
  tokens: TokenService;
  rateLimiter: RateLimitService;
  mailer: MailService | MailLike;
  avatarStorage: AvatarStorage | AvatarStubLike;
  identity: IdentityService;
  notifications: NotificationService;
  friendships: FriendshipService;
  directory: DirectoryService;
  admin: AdminService;
  quizzes: QuizEngine;
}

export interface Container {
  db: ReturnType<typeof openDatabase>;
  config: AppConfig;
  repos: {
    users: UsersRepository;
    sessions: SessionsRepository;
    tokens: TokensRepository;
    rateLimits: RateLimitsRepository;
    emailChanges: EmailChangesRepository;
    friendships: FriendshipsRepository;
    notifications: NotificationsRepository;
    tests: TestsRepository;
    questions: QuestionsRepository;
    attempts: AttemptsRepository;
  };
  services: ContainerServices;
  /** Test-only convenience shortcuts (set by createTestContainer). */
  mailer?: MailService | MailSpy;
  avatarStorage?: AvatarStorage | AvatarStubLike | null;
  close(): void;
}

/** Structural type for a mailer that records sends (test spy). */
interface MailLike {
  sendLink: (input: { email: string; subject: string; url: string }) => Promise<{ ok: boolean }>;
}

/** Test mail spy shape (see tests/helpers.ts createMailSpy). */
interface MailSpy extends MailLike {
  sent: Array<{ email: string; subject: string; url: string }>;
}

/** Structural type for an avatar storage stub (see tests/helpers.ts). */
interface AvatarStubLike {
  saved: Array<{ bytes: number; mimetype: string }>;
  removed: Array<string | null | undefined>;
  init: () => Promise<void>;
  save: (buffer: Uint8Array, input: { mimetype: string }) => Promise<string>;
  remove: (relative: string | null | undefined) => Promise<void>;
}

interface ContainerOverrides {
  usersRepo?: UsersRepository;
  sessionsRepo?: SessionsRepository;
  tokensRepo?: TokensRepository;
  rateLimitsRepo?: RateLimitsRepository;
  emailChangesRepo?: EmailChangesRepository;
  friendshipsRepo?: FriendshipsRepository;
  notificationsRepo?: NotificationsRepository;
  testsRepo?: TestsRepository;
  questionsRepo?: QuestionsRepository;
  attemptsRepo?: AttemptsRepository;
  mailer?: MailService | MailLike;
  avatarStorage?: AvatarStorage | AvatarStubLike;
  crypto?: {
    hashPassword: typeof import('./services/crypto.js').hashPassword;
    passwordMatches: typeof import('./services/crypto.js').passwordMatches;
    randomToken: () => string;
    digest: (value: string) => string;
  };
}

/**
 * Composition root. Builds the object graph once per application lifecycle so
 * every layer shares a single database connection and service instances.
 * `overrides` lets tests inject fakes (clock, repos) while reusing real wiring.
 */
export function buildContainer({
  dbPath = config.databasePath,
  clock,
  overrides = {},
}: {
  dbPath?: string;
  clock?: () => number;
  overrides?: ContainerOverrides;
} = {}): Container {
  const db = openDatabase(dbPath, { migrate: true });

  const usersRepo = overrides.usersRepo || new UsersRepository(db);
  const sessionsRepo = overrides.sessionsRepo || new SessionsRepository(db);
  const tokensRepo = overrides.tokensRepo || new TokensRepository(db);
  const rateLimitsRepo = overrides.rateLimitsRepo || new RateLimitsRepository(db);
  const emailChangesRepo = overrides.emailChangesRepo || new EmailChangesRepository(db);
  const friendshipsRepo = overrides.friendshipsRepo || new FriendshipsRepository(db);
  const notificationsRepo = overrides.notificationsRepo || new NotificationsRepository(db);
  const testsRepo = overrides.testsRepo || new TestsRepository(db);
  const questionsRepo = overrides.questionsRepo || new QuestionsRepository(db);
  const attemptsRepo = overrides.attemptsRepo || new AttemptsRepository(db);

  const sessions = new SessionService({
    sessionsRepo,
    config,
    clock,
    ...(overrides.crypto ? { crypto: overrides.crypto } : {}),
  });
  const tokens = new TokenService({
    tokensRepo,
    clock,
    ...(overrides.crypto ? { crypto: overrides.crypto } : {}),
  });
  const rateLimiter = new RateLimitService({
    rateLimitsRepo,
    config,
    clock,
    ...(overrides.crypto ? { crypto: overrides.crypto } : {}),
  });
  const mailer = overrides.mailer || new MailService(config.mail);
  // Avatar storage adapter; tests may stub it via overrides.avatarStorage.
  const avatarStorage =
    overrides.avatarStorage || new AvatarStorage({ uploadDir: config.uploadDir });
  const identity = new IdentityService({
    usersRepo,
    emailChangesRepo,
    tokens,
    sessions,
    mailer,
    rateLimiter,
    avatarStorage,
    config,
    clock,
  });
  const notifications = new NotificationService({ notificationsRepo, clock });
  const friendships = new FriendshipService({
    friendshipsRepo,
    usersRepo,
    notifications,
    clock,
  });
  const directory = new DirectoryService({ usersRepo, friendships, notifications });
  const admin = new AdminService({
    usersRepo,
    friendshipsRepo,
    notificationsRepo,
    sessionsRepo,
    clock,
  });
  const quizzes = new QuizEngine({ testsRepo, questionsRepo, attemptsRepo, clock });

  return {
    db,
    config,
    repos: {
      users: usersRepo,
      sessions: sessionsRepo,
      tokens: tokensRepo,
      rateLimits: rateLimitsRepo,
      emailChanges: emailChangesRepo,
      friendships: friendshipsRepo,
      notifications: notificationsRepo,
      tests: testsRepo,
      questions: questionsRepo,
      attempts: attemptsRepo,
    },
    services: {
      sessions,
      tokens,
      rateLimiter,
      mailer,
      avatarStorage,
      identity,
      notifications,
      friendships,
      directory,
      admin,
      quizzes,
    },
    close() {
      closeDatabase(db);
    },
  };
}