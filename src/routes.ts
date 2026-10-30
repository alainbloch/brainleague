import type { FastifyInstance } from 'fastify';
import type { AuthController } from './controllers/authController.js';
import type { PageController } from './controllers/pageController.js';
import type { SettingsController } from './controllers/settingsController.js';
import type { UsersController } from './controllers/usersController.js';
import type { NotificationsController } from './controllers/notificationsController.js';
import type { AdminController } from './controllers/adminController.js';
import type { QuizzesController } from './controllers/quizzesController.js';
import type { LeaderboardController } from './controllers/leaderboardController.js';
import type { ContentAdminController } from './controllers/contentAdminController.js';
import type { TutorialsController } from './controllers/tutorialsController.js';

export interface RouteDependencies {
  authController: AuthController;
  pageController: PageController;
  settingsController: SettingsController;
  usersController: UsersController;
  notificationsController: NotificationsController;
  adminController: AdminController;
  quizzesController: QuizzesController;
  leaderboardController: LeaderboardController;
  contentAdminController: ContentAdminController;
  tutorialsController: TutorialsController;
  authMiddleware: (
    request: import('fastify').FastifyRequest,
    reply: import('fastify').FastifyReply,
  ) => Promise<void>;
  adminMiddleware: (
    request: import('fastify').FastifyRequest,
    reply: import('fastify').FastifyReply,
  ) => Promise<void>;
}

/** Route group guard helper applies both middlewares to every listed route. */
const adminGuard = (
  authMiddleware: RouteDependencies['authMiddleware'],
  adminMiddleware: RouteDependencies['adminMiddleware'],
) => ({ preHandler: [authMiddleware, adminMiddleware] });

/**
 * Routes for public pages, auth, settings, the social layer, the timed
 * practice-test flow + leaderboards, tutorials, and admin (user + content).
 */
export async function registerRoutes(
  app: FastifyInstance,
  {
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
    authMiddleware,
    adminMiddleware,
  }: RouteDependencies,
): Promise<void> {
  // Public
  app.get('/', pageController.showHome.bind(pageController));

  // Auth pages
  app.get('/login', authController.showLogin.bind(authController));
  app.post('/login', authController.login.bind(authController));
  app.get('/register', authController.showRegister.bind(authController));
  app.post('/register', authController.register.bind(authController));
  app.get('/logout', authController.logout.bind(authController));

  // Magic links
  app.get('/auth/verify', authController.verify.bind(authController));
  app.get('/auth/forgot', authController.forgotGet.bind(authController));
  app.post('/auth/forgot', authController.forgotPost.bind(authController));
  app.get('/auth/reset', authController.resetGet.bind(authController));
  app.post('/auth/reset', authController.resetPost.bind(authController));

  // Protected
  app.get(
    '/account',
    { preHandler: authMiddleware },
    pageController.showAccount.bind(pageController),
  );

  // Public tutorials for any signed-in user.
  app.get(
    '/tutorials',
    { preHandler: authMiddleware },
    tutorialsController.showList.bind(tutorialsController),
  );
  app.get(
    '/tutorials/:slug',
    { preHandler: authMiddleware },
    tutorialsController.showDetail.bind(tutorialsController),
  );

  // Account settings (all require an authenticated session)
  app.get(
    '/settings',
    { preHandler: authMiddleware },
    settingsController.showSettings.bind(settingsController),
  );
  app.post(
    '/settings/profile',
    { preHandler: authMiddleware },
    settingsController.updateName.bind(settingsController),
  );
  app.post(
    '/settings/avatar',
    { preHandler: authMiddleware },
    settingsController.uploadAvatar.bind(settingsController),
  );
  app.post(
    '/settings/email',
    { preHandler: authMiddleware },
    settingsController.changeEmail.bind(settingsController),
  );
  app.get(
    '/settings/confirm-email',
    settingsController.confirmEmailChange.bind(settingsController),
  );
  app.post(
    '/settings/password',
    { preHandler: authMiddleware },
    settingsController.changePassword.bind(settingsController),
  );

  // User directory and profiles
  app.get(
    '/users',
    { preHandler: authMiddleware },
    usersController.showDirectory.bind(usersController),
  );
  app.get(
    '/users/:id',
    { preHandler: authMiddleware },
    usersController.showProfile.bind(usersController),
  );

  // Friendship actions
  app.post(
    '/users/:id/friend',
    { preHandler: authMiddleware },
    usersController.sendFriendRequest.bind(usersController),
  );
  app.post(
    '/users/:id/accept',
    { preHandler: authMiddleware },
    usersController.acceptFriendRequest.bind(usersController),
  );
  app.post(
    '/users/:id/unfriend',
    { preHandler: authMiddleware },
    usersController.removeFriend.bind(usersController),
  );

  // Notification inbox
  app.get(
    '/notifications',
    { preHandler: authMiddleware },
    notificationsController.showInbox.bind(notificationsController),
  );
  app.post(
    '/notifications/read',
    { preHandler: authMiddleware },
    notificationsController.markAllRead.bind(notificationsController),
  );

  // Timed practice-test flow (all require an authenticated session)
  app.get(
    '/tests',
    { preHandler: authMiddleware },
    quizzesController.showCatalog.bind(quizzesController),
  );
  app.get(
    '/tests/:slug/take',
    { preHandler: authMiddleware },
    quizzesController.takeTest.bind(quizzesController),
  );
  app.post(
    '/tests/:attemptId/progress',
    { preHandler: authMiddleware },
    quizzesController.saveProgress.bind(quizzesController),
  );
  app.post(
    '/tests/:attemptId/submit',
    { preHandler: authMiddleware },
    quizzesController.submitTest.bind(quizzesController),
  );
  app.get(
    '/tests/:attemptId/result',
    { preHandler: authMiddleware },
    quizzesController.showResult.bind(quizzesController),
  );

  // Leaderboards index + per-test global and friends
  app.get(
    '/leaderboards',
    { preHandler: authMiddleware },
    leaderboardController.showIndex.bind(leaderboardController),
  );
  app.get(
    '/tests/:slug/leaderboard',
    { preHandler: authMiddleware },
    leaderboardController.showGlobal.bind(leaderboardController),
  );
  app.get(
    '/tests/:slug/leaderboard/friends',
    { preHandler: authMiddleware },
    leaderboardController.showFriends.bind(leaderboardController),
  );

  // Admin (role-gated)
  app.get(
    '/admin',
    { preHandler: [authMiddleware, adminMiddleware] },
    adminController.dashboard.bind(adminController),
  );
  app.get(
    '/admin/users',
    { preHandler: [authMiddleware, adminMiddleware] },
    adminController.listUsers.bind(adminController),
  );
  app.post(
    '/admin/users/:id/role',
    { preHandler: [authMiddleware, adminMiddleware] },
    adminController.changeRole.bind(adminController),
  );
  app.post(
    '/admin/users/:id/delete',
    { preHandler: [authMiddleware, adminMiddleware] },
    adminController.deleteUser.bind(adminController),
  );
  app.get(
    '/admin/users/:id/edit',
    { preHandler: [authMiddleware, adminMiddleware] },
    adminController.editUser.bind(adminController),
  );
  app.post(
    '/admin/users/:id/edit',
    { preHandler: [authMiddleware, adminMiddleware] },
    adminController.updateUser.bind(adminController),
  );
  app.get(
    '/admin/broadcast',
    { preHandler: [authMiddleware, adminMiddleware] },
    adminController.showBroadcast.bind(adminController),
  );
  app.post(
    '/admin/broadcast',
    { preHandler: [authMiddleware, adminMiddleware] },
    adminController.sendBroadcast.bind(adminController),
  );

  // Admin content management
  const guard = adminGuard(authMiddleware, adminMiddleware);
  app.get('/admin/tests', guard, contentAdminController.listTests.bind(contentAdminController));
  app.get('/admin/tests/new', guard, contentAdminController.newTest.bind(contentAdminController));
  app.post('/admin/tests', guard, contentAdminController.createTest.bind(contentAdminController));
  app.get(
    '/admin/tests/:id/edit',
    guard,
    contentAdminController.editTest.bind(contentAdminController),
  );
  app.post(
    '/admin/tests/:id/edit',
    guard,
    contentAdminController.updateTest.bind(contentAdminController),
  );
  app.post(
    '/admin/tests/:id/delete',
    guard,
    contentAdminController.deleteTest.bind(contentAdminController),
  );

  app.get(
    '/admin/questions',
    guard,
    contentAdminController.listQuestions.bind(contentAdminController),
  );
  app.get(
    '/admin/questions/new',
    guard,
    contentAdminController.newQuestion.bind(contentAdminController),
  );
  app.post(
    '/admin/questions',
    guard,
    contentAdminController.createQuestion.bind(contentAdminController),
  );
  app.get(
    '/admin/questions/:id/edit',
    guard,
    contentAdminController.editQuestion.bind(contentAdminController),
  );
  app.post(
    '/admin/questions/:id/edit',
    guard,
    contentAdminController.updateQuestion.bind(contentAdminController),
  );
  app.post(
    '/admin/questions/:id/delete',
    guard,
    contentAdminController.deleteQuestion.bind(contentAdminController),
  );

  app.get(
    '/admin/categories',
    guard,
    contentAdminController.listCategories.bind(contentAdminController),
  );
  app.get(
    '/admin/categories/new',
    guard,
    contentAdminController.newCategory.bind(contentAdminController),
  );
  app.post(
    '/admin/categories',
    guard,
    contentAdminController.createCategory.bind(contentAdminController),
  );
  app.get(
    '/admin/categories/:slug/edit',
    guard,
    contentAdminController.editCategory.bind(contentAdminController),
  );
  app.post(
    '/admin/categories/:slug/edit',
    guard,
    contentAdminController.updateCategory.bind(contentAdminController),
  );
  app.post(
    '/admin/categories/:slug/delete',
    guard,
    contentAdminController.deleteCategory.bind(contentAdminController),
  );

  app.get(
    '/admin/tutorials',
    guard,
    contentAdminController.listTutorials.bind(contentAdminController),
  );
  app.get(
    '/admin/tutorials/new',
    guard,
    contentAdminController.newTutorial.bind(contentAdminController),
  );
  app.post(
    '/admin/tutorials',
    guard,
    contentAdminController.createTutorial.bind(contentAdminController),
  );
  app.get(
    '/admin/tutorials/:id/edit',
    guard,
    contentAdminController.editTutorial.bind(contentAdminController),
  );
  app.post(
    '/admin/tutorials/:id/edit',
    guard,
    contentAdminController.updateTutorial.bind(contentAdminController),
  );
  app.post(
    '/admin/tutorials/:id/delete',
    guard,
    contentAdminController.deleteTutorial.bind(contentAdminController),
  );
}