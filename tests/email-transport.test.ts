import { describe, expect, it } from 'vitest';
import { parseAddress, sendViaBrevo } from '../src/server/email/transport';

const message = { to: 'ucastnik@example.test', subject: 'Pozvánka', text: 'Text', html: '<p>Text</p>' };
const settings = { apiKey: 'test-key', from: 'Kurz Czechitas <kurz@example.test>' };

describe('Brevo email API', () => {
  it('sends the message with the sender from SMTP_FROM', async () => {
    let request: { url: string; init: RequestInit } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      request = { url, init };
      return new Response(JSON.stringify({ messageId: '<1@brevo>' }), { status: 201 });
    }) as typeof fetch;

    await sendViaBrevo(message, settings, fetchImpl);
    expect(request?.url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((request?.init.headers as Record<string, string>)['api-key']).toBe('test-key');
    expect(JSON.parse(request?.init.body as string)).toEqual({
      sender: { name: 'Kurz Czechitas', email: 'kurz@example.test' },
      to: [{ email: 'ucastnik@example.test' }],
      subject: 'Pozvánka',
      textContent: 'Text',
      htmlContent: '<p>Text</p>',
    });
  });

  it('reports rejections and network failures with the reason', async () => {
    const rejected = (async () => new Response(JSON.stringify({ message: 'Key not found' }), { status: 401 })) as typeof fetch;
    await expect(sendViaBrevo(message, settings, rejected)).rejects.toThrow('Brevo rejected the email (HTTP 401): Key not found');
    const offline = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await expect(sendViaBrevo(message, settings, offline)).rejects.toThrow('Brevo is unreachable: fetch failed');
  });

  it('parses sender addresses', () => {
    expect(parseAddress('"Kurz Czechitas" <kurz@example.test>')).toEqual({ name: 'Kurz Czechitas', email: 'kurz@example.test' });
    expect(parseAddress('<kurz@example.test>')).toEqual({ email: 'kurz@example.test' });
    expect(parseAddress('kurz@example.test')).toEqual({ email: 'kurz@example.test' });
  });
});
