export interface MailConfig {
  transport: string;
  from: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
}

export interface SendLinkInput {
  email: string;
  subject: string;
  url: string;
}

interface Logger {
  log: (...args: unknown[]) => void;
}

/**
 * Outbound email for verification / reset magic links. Delivered through a
 * transport adapter selected by config so the rest of the app never depends on
 * a particular provider. The 'console' transport logs the full link to stdout,
 * which is sufficient for local development and tests.
 */
export class MailService {
  readonly config: MailConfig;
  readonly logger: Logger;

  constructor(config: MailConfig, logger: Logger = console) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Send a magic-link email. `url` is the absolute link for the recipient.
   * This is intentionally async so an SMTP transport can be swapped in later
   * without altering callers.
   */
  async sendLink({
    email,
    subject,
    url,
  }: SendLinkInput): Promise<{ transport: string; ok: boolean }> {
    switch (this.config.transport) {
      case 'smtp':
        return this.#sendSmtp({ email, subject, url });
      case 'console':
      default: {
        this.logger.log(
          `\n[mail:console] To: ${email}\n[mail:console] Subject: ${subject}\n[mail:console] Link: ${url}\n`,
        );
        return { transport: 'console', ok: true };
      }
    }
  }

  async #sendSmtp({
    email: _email,
    subject: _subject,
    url: _url,
  }: SendLinkInput): Promise<{ transport: string; ok: boolean }> {
    const { smtpHost, smtpUser } = this.config;
    if (!smtpHost) {
      throw new Error('MAIL_TRANSPORT=smtp requires SMTP_HOST.');
    }
    // Real SMTP delivery needs a transport library wired in (e.g. nodemailer).
    // This adapter intentionally fails loudly rather than claim a send happened,
    // so a mis-configured deployment cannot silently drop verification/reset mail.
    throw new Error(
      `SMTP transport for ${smtpUser || smtpHost} is not wired in this deployment. ` +
        'Integrate a mail transport or use MAIL_TRANSPORT=console.',
    );
  }
}
