import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyFormBody from '@fastify/formbody';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContainer, type Container } from './container.js';
import { setupViews } from './viewEngine.js';
import { uiHelpers } from './ui/classes.js';
import { AuthController } from './controllers/authController.js';
import { PageController } from './controllers/pageController.js';
import { SettingsController } from './controllers/settingsController.js';
import { UsersController } from './controllers/usersController.js';
import { NotificationsController } from './controllers/notificationsController.js';
import { AdminController } from './controllers/adminController.js';
import { QuizzesController } from './controllers/quizzesController.js';
import { LeaderboardController } from './controllers/leaderboardController.js';
import { ContentAdminController } from './controllers/contentAdminController.js';
import { TutorialsController } from './controllers/tutorialsController.js';
import { resolveUser, requireAuth, requireAdmin } from './middleware/auth.js';
import { registerRoutes } from './routes.js';
import { registerMcpRoutes } from './mcp/http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Fastify application factory. `container` may be provided by tests; when
 * omitted a real container backed by config is built. The server itself owns
 * only HTTP concerns — all business logic lives in services/repositories.
 */
export async function buildApp({
  container,
}: { container?: Container } = {}): Promise<FastifyInstance> {
  const appContainer = container || buildContainer();
  appContainer.services.sessions.garbageCollect();
  appContainer.services.tokens.garbageCollect();

  const fastify = Fastify({
    trustProxy: true,
    logger: appContainer.config.nodeEnv !== 'test',
    disableRequestLogging: appContainer.config.nodeEnv === 'production',
  });

  // Plugins
  await fastify.register(fastifyCookie);
  await fastify.register(fastifyFormBody);
  await fastify.register(fastifyMultipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });
  await fastify.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/',
    wildcard: false,
  });
  // User uploads (avatars) served from UPLOAD_DIR. Registered under /uploads/
  // so storage stays outside the compiled assets directory.
  await appContainer.services.avatarStorage.init();
  await fastify.register(fastifyStatic, {
    root: appContainer.config.uploadDir,
    prefix: '/uploads/',
    decorateReply: false,
  });

  // Views with rubyminer-core UI helpers + resolved user for every request.
  setupViews(fastify, { nodeEnv: appContainer.config.nodeEnv, helpers: uiHelpers });
  fastify.addHook('onRequest', resolveUser(appContainer.services.identity));
  // Light per-request unread badge for the nav (only for authenticated users).
  fastify.addHook('onRequest', async (request) => {
    if (request.user) {
      request.unreadNotifications = appContainer.services.notifications.unreadCount(
        request.user.id,
      );
    }
  });

  // Controllers (bound once; share the container).
  const authController = new AuthController({
    services: appContainer.services,
    config: appContainer.config,
  });
  const pageController = new PageController({ testsRepo: appContainer.repos.tests });
  const settingsController = new SettingsController({
    services: appContainer.services,
    config: appContainer.config,
  });
  const usersController = new UsersController({
    directory: appContainer.services.directory,
    friendships: appContainer.services.friendships,
  });
  const notificationsController = new NotificationsController({
    notifications: appContainer.services.notifications,
  });
  const adminController = new AdminController({ admin: appContainer.services.admin });
  const quizzesController = new QuizzesController({
    quizzes: appContainer.services.quizzes,
    leaderboards: appContainer.services.leaderboards,
  });
  const leaderboardController = new LeaderboardController({
    leaderboard: appContainer.services.leaderboards,
    testsRepo: appContainer.repos.tests,
  });
  const contentAdminController = new ContentAdminController({
    content: appContainer.services.contentAdmin,
  });
  const tutorialsController = new TutorialsController({
    content: appContainer.services.contentAdmin,
  });
  await registerRoutes(fastify, {
    authController,
    pageController,
    settingsController,
    usersController,
    notificationsController,
    adminController,
    quizzesController,
    leaderboardController,
    contentAdminController,
    tutorialsController,
    authMiddleware: requireAuth(appContainer.services.identity),
    adminMiddleware: requireAdmin(appContainer.services.identity),
  });

  // Health check (Railway requirement).
  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // MCP agent endpoint (streamable HTTP), opt-in via MCP_HTTP_ENABLED=true.
  if (appContainer.config.mcp.httpEnabled) {
    registerMcpRoutes(fastify, appContainer.services);
  }

  return fastify;
}