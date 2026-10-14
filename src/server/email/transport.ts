// Email delivery: SMTP (Nodemailer), or the Brevo HTTP API when BREVO_API_KEY is set (for hosts
// that block outgoing SMTP, such as Railway's Hobby plan).
import nodemailer, { type Transporter } from 'nodemailer';
import { getConfig } from '../config';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (!transporter) {
    const config = getConfig();
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      ...(config.SMTP_USER ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD ?? '' } } : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

/** Tests can replace the transport, e.g. with one pointing at a closed port. */
export function setTransporterForTests(replacement: Transporter | undefined): void {
  transporter = replacement;
}

/**
 * Hands the message to the SMTP server or Brevo. Success means the service accepted it,
 * not that the recipient received it.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const config = getConfig();
  // A transport set by tests takes precedence.
  if (config.BREVO_API_KEY && !transporter) {
    await sendViaBrevo(message, { apiKey: config.BREVO_API_KEY, from: config.SMTP_FROM });
    return;
  }
  await getTransporter().sendMail({ from: config.SMTP_FROM, ...message });
}

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

/** Sends one message through Brevo's transactional email API. Throws with Brevo's reason on failure. */
export async function sendViaBrevo(
  message: EmailMessage,
  settings: { apiKey: string; from: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': settings.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: parseAddress(settings.from),
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        htmlContent: message.html,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new Error(`Brevo is unreachable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
    throw new Error(`Brevo rejected the email (HTTP ${response.status})${body?.message ? `: ${body.message}` : ''}`);
  }
}

/** `Name <email>` or a bare address, as in SMTP_FROM. */
export function parseAddress(value: string): { email: string; name?: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value);
  if (!match) return { email: value.trim() };
  const name = match[1]!.trim();
  return name ? { email: match[2]!.trim(), name } : { email: match[2]!.trim() };
}
