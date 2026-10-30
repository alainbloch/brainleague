import 'dotenv/config';
import path from 'node:path';

function int(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value || '', 10);
  return Number.isFinite(n) ? n : fallback;
}

export interface AppConfig {
  port: number;
  host: string;
  nodeEnv: string;
  isProduction: boolean;
  databasePath: string;
  uploadDir: string;
  appUrl: string;
  sessionSecret: string;
  sessionDurationMs: number;
  rateLimit: { windowMs: number; perIp: number; perEmail: number };
  mcp: {
    httpEnabled: boolean;
  };
  mail: {
    transport: string;
    from: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
  };
}

const sessionSecret =
  process.env.SESSION_SECRET ||
  (process.env.NODE_ENV === 'production' ? '' : 'dev-only-insecure-secret-do-not-use-in-prod');

const config = {
  port: int(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  databasePath: process.env.DATABASE_PATH || './data/app.db',
  // Resolved to an absolute path: @fastify/static requires one, and uploads
  // must live on the same Railway volume as the database.
  uploadDir: path.resolve(process.env.UPLOAD_DIR || './data/uploads'),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  sessionSecret,
  sessionDurationMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    perIp: int(process.env.RATE_LIMIT_PER_IP, 30),
    perEmail: int(process.env.RATE_LIMIT_PER_EMAIL, 8),
  },
  // MCP agent endpoint at /mcp (streamable HTTP). Off by default; enable with
  // MCP_HTTP_ENABLED=true. Tool calls still require a sessionToken from the
  // authenticate tool — this only exposes the transport, not anonymous access.
  mcp: {
    httpEnabled: process.env.MCP_HTTP_ENABLED === 'true',
  },
  mail: {
    transport: process.env.MAIL_TRANSPORT || 'console', // 'console' | 'smtp'
    from: process.env.MAIL_FROM || 'noreply@example.test',
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: int(process.env.SMTP_PORT, 587),
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
  },
};

export function validateConfig() {
  if (config.isProduction && !sessionSecret) {
    throw new Error('SESSION_SECRET is required in production.');
  }
  return config;
}

export default config;
