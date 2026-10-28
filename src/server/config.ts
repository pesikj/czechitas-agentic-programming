import { existsSync } from 'node:fs';
import { z } from 'zod';

// Local development reads .env; variables already set in the environment take precedence.
if (existsSync('.env')) process.loadEnvFile('.env');

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const configSchema = z.object({
  APP_BASE_URL: z.url(),
  DATABASE_URL: z.string().min(1),

  /**
   * Send email through the Brevo HTTP API instead of SMTP (for hosts that block SMTP, such as
   * Railway's Hobby plan). When set, the SMTP_HOST/SMTP_PORT settings are not needed.
   */
  BREVO_API_KEY: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: booleanString,
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  /** Sender of all emails, e.g. `Kurz Czechitas <kurz@example.cz>` (SMTP and Brevo). */
  SMTP_FROM: z.string().min(1),

  CONTENT_REPO_URL: z.string().min(1),
  CONTENT_BRANCH: z.string().min(1).default('main'),
  /**
   * Access token for a private content repository fetched over HTTPS, e.g. a fine-grained GitHub
   * token with read-only access to its contents. Kept out of CONTENT_REPO_URL, so it is never shown.
   */
  CONTENT_REPO_TOKEN: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),
  /**
   * Optional preview mode for authors and tests: read content directly from this directory and
   * skip publishing. Never set in production, where only published revisions are shown.
   */
  CONTENT_DIR: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),
  /** Trust X-Forwarded-For from the reverse proxy for client addresses (rate limiting). */
  TRUST_PROXY: booleanString,

  SUPPORT_EMAIL: z.email(),

  // Confirmed policy values; see docs/decisions.md.
  INVITATION_TTL_HOURS: z.coerce.number().int().positive().default(168),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
}).superRefine((config, context) => {
  if (config.BREVO_API_KEY) return;
  for (const key of ['SMTP_HOST', 'SMTP_PORT'] as const) {
    if (!config[key]) context.addIssue({ code: 'custom', path: [key], message: `${key} is required unless BREVO_API_KEY is set.` });
  }
});

export type Config = z.infer<typeof configSchema>;

let cached: Config | undefined;

/** Reads and validates server configuration from the environment. Throws on invalid values. */
export function getConfig(env: Record<string, string | undefined> = process.env): Config {
  if (cached && env === process.env) return cached;
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  }
  if (env === process.env) cached = result.data;
  return result.data;
}

/** Session cookies are Secure (and `__Host-` prefixed) whenever the site is served over HTTPS. */
export function usesHttps(config: Config = getConfig()): boolean {
  return config.APP_BASE_URL.startsWith('https://');
}
