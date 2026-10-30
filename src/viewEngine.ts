import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nunjucks from 'nunjucks';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { icon } from './ui/icons.js';
import type { uiHelpers } from './ui/classes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS_DIR = path.join(__dirname, 'views');
// Nunjucks is CommonJS; SafeString is on the runtime object.
const { SafeString } = nunjucks.runtime;

export interface UiHelpers {
  [key: string]: unknown;
  json: (v: unknown) => string;
  icon: (name: string, options?: Record<string, unknown>) => nunjucks.runtime.SafeString;
  initials: (name: string | null | undefined) => string;
  date: (ts: number) => string;
  relativeDate: (ts: number) => string;
}

/**
 * Nunjucks view engine wired into Fastify. `reply.view(name, ctx)` renders a
 * template under `src/views/`. A `ui` helper object exposes the rubyminer-core
 * component class strings so templates compose buttons/inputs/alerts without
 * duplicating class lists.
 */
export function setupViews(
  app: FastifyInstance,
  { nodeEnv, helpers }: { nodeEnv: string; helpers: typeof uiHelpers },
): void {
  const env = nunjucks.configure(VIEWS_DIR, {
    autoescape: true,
    noCache: nodeEnv !== 'production',
  });

  const ui: UiHelpers = {
    ...helpers,
    json: (v: unknown) => JSON.stringify(v),
    // Inline SVG icon symbols (rubyminer-core paths). Wrapped in SafeString so
    // autoescaping does not turn the markup into visible "<svg…>" text.
    icon: (name: string, options?: Record<string, unknown>) =>
      new SafeString(icon(name, options as { size?: number; className?: string })),
    initials: (name: string | null | undefined) => {
      const parts = String(name || '')
        .split(/\s+/)
        .filter(Boolean);
      if (!parts.length) return '?';
      return (
        parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]
      ).toUpperCase();
    },
    date: (ts: number) => new Date(ts).toISOString().slice(0, 10),
    relativeDate: (ts: number) => {
      const days = Math.floor((Date.now() - ts) / 86400000);
      if (days <= 0) return 'today';
      if (days === 1) return 'yesterday';
      if (days < 30) return `${days} days ago`;
      return new Date(ts).toISOString().slice(0, 10);
    },
  };

  // Registered as a global so Nunjucks macros (which do not inherit render
  // context) can call the component helpers from their own scope.
  env.addGlobal('ui', ui);

  app.decorate('viewEngine', env);
  app.decorate('viewHelpers', ui);

  app.decorateReply(
    'view',
    function view(
      this: FastifyReply,
      name: string,
      ctx: Record<string, unknown> = {},
      statusCode?: number,
    ): FastifyReply {
      if (statusCode !== undefined) this.code(statusCode);
      // Controllers pass logical names ("auth/login"); resolve the template file.
      const templateName = name.includes('.') ? name : `${name}.njk`;
      // The per-request unread badge (computed in an onRequest hook) is injected
      // here so every rendered page — including non-controller templates — gets it.
      const base =
        (this.request as FastifyReply['request'] & { unreadNotifications?: number })
          ?.unreadNotifications !== undefined
          ? {
              unreadNotifications: (
                this.request as FastifyReply['request'] & {
                  unreadNotifications?: number;
                }
              ).unreadNotifications,
            }
          : {};
      const html = env.render(templateName, { ...base, ...ctx });
      this.type('text/html').send(html);
      return this;
    },
  );
}
