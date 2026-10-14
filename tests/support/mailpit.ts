// Reads messages from the Mailpit test mailbox (docker compose).
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

interface Summary {
  ID: string;
  Subject: string;
  Created: string;
}

/** Newest message sent to the address, waiting for it to arrive. */
export async function latestEmailTo(address: string, options: { after?: Date; timeoutMs?: number } = {}) {
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);
  while (Date.now() < deadline) {
    const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
    if (!response.ok) throw new Error(`Mailpit is not reachable at ${MAILPIT_URL} (docker compose up -d)`);
    const { messages } = (await response.json()) as { messages: Summary[] };
    const fresh = messages.filter((message) => !options.after || new Date(message.Created) >= options.after);
    if (fresh[0]) {
      const detail = await fetch(`${MAILPIT_URL}/api/v1/message/${fresh[0].ID}`);
      const body = (await detail.json()) as { Subject: string; Text: string };
      return { subject: body.Subject, text: body.Text };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No email to ${address} arrived in Mailpit`);
}

export async function countEmailsTo(address: string): Promise<number> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  const { messages } = (await response.json()) as { messages: Summary[] };
  return messages.length;
}

export const otpFrom = (text: string) => /Jednorázové heslo: ([A-Z0-9-]+)/.exec(text)?.[1];
export const resetLinkFrom = (text: string) => /(https?:\/\/\S+\/obnova-hesla\/\S+)/.exec(text)?.[1];

/** Unique address per test run, so parallel tests and old messages never collide. */
export function testAddress(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}
