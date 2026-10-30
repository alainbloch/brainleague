import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { buildContainer, type Container } from './container.js';
import { validateConfig } from './config.js';

/**
 * Production entry point. Listens on 0.0.0.0:PORT (Railway), performs graceful
 * shutdown on SIGTERM/SIGINT, and closes the database connection on exit.
 */
async function main(): Promise<void> {
  const config = validateConfig();
  const container: Container = buildContainer();
  const app: FastifyInstance = await buildApp({ container });
  app.decorate('container', container);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    try {
      await app.close();
    } finally {
      container.close();
      // eslint-disable-next-line no-process-exit
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`Ready at http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    container.close();
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  }
}

void main();
