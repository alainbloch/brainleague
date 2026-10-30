import type { FastifyInstance } from 'fastify';
import type { AuthController } from './controllers/authController.js';
import type { PageController } from './controllers/pageController.js';
import type { SettingsController } from './controllers/settingsController.js';
import type { UsersController } from './controllers/usersController.js';
import type { NotificationsController } from './controllers/notificationsController.js';
import type { AdminController } from './controllers/adminController.js';
import type { QuizzesController } from './controllers/quizzesController.js';

export interface RouteDependencies {
  authController: AuthController;
  pageController: PageController;
  settingsController: SettingsController;
  usersController: UsersController;
  notificationsController: NotificationsController;
  adminController: AdminController;
  quizzesController: QuizzesController;
  authMiddleware: (
    request: import('fastify').FastifyRequest,
    reply: import('fastify').FastifyReply,
  ) => Promise<void>;
  adminMiddleware: (
    request: import('fastify').FastifyRequest,
    reply: import('fastify').FastifyReply,
  ) => Promise<void>;
}

/**
 * Routes for public pages, auth, settings, the social layer, admin, and the
 * timed practice-test flow.
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

  // Notification inbox (future-facing but wired today)
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
    '/tests/:attemptId/submit',
    { preHandler: authMiddleware },
    quizzesController.submitTest.bind(quizzesController),
  );
  app.get(
    '/tests/:attemptId/result',
    { preHandler: authMiddleware },
    quizzesController.showResult.bind(quizzesController),
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
}