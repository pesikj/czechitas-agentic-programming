// Czech transactional emails. Plain text is the primary content; the HTML part mirrors it.
import type { EmailMessage } from './transport';

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

function html(paragraphs: string[]): string {
  return `<!doctype html><html lang="cs"><body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1b1b1b;">${paragraphs
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join('')}</body></html>`;
}

export interface InvitationData {
  /** `reset`: an administrator replaced the user's credentials. */
  kind?: 'invitation' | 'reset';
  to: string;
  otp: string;
  signInUrl: string;
  validDays: number;
  supportEmail: string;
}

export function invitationEmail(data: InvitationData): EmailMessage {
  const reset = data.kind === 'reset';
  const intro = reset
    ? 'administrátor obnovil váš přístup k materiálům kurzu. Dosavadní heslo už neplatí.'
    : 'byl vám vytvořen přístup k materiálům kurzu.';
  const text = [
    'Dobrý den,',
    intro,
    `Přihlaste se na adrese:\n${data.signInUrl}`,
    `E-mail: ${data.to}\nJednorázové heslo: ${data.otp}`,
    `Po prvním přihlášení si nastavíte vlastní heslo. Jednorázové heslo platí ${data.validDays} dní.`,
    'Pokud vám přišlo více pozvánek, použijte tu nejnovější – starší jednorázová hesla už neplatí.',
    `Potřebujete pomoc? Napište na ${data.supportEmail}.`,
  ];
  return {
    to: data.to,
    subject: reset ? 'Obnovený přístup k materiálům kurzu' : 'Přístup k materiálům kurzu',
    text: text.join('\n\n'),
    html: html([
      'Dobrý den,',
      escape(intro),
      `Přihlaste se na adrese:<br><a href="${escape(data.signInUrl)}">${escape(data.signInUrl)}</a>`,
      `E-mail: ${escape(data.to)}<br>Jednorázové heslo: <strong style="font-family: monospace; font-size: 1.2em;">${escape(data.otp)}</strong>`,
      `Po prvním přihlášení si nastavíte vlastní heslo. Jednorázové heslo platí ${data.validDays} dní.`,
      'Pokud vám přišlo více pozvánek, použijte tu nejnovější – starší jednorázová hesla už neplatí.',
      `Potřebujete pomoc? Napište na <a href="mailto:${escape(data.supportEmail)}">${escape(data.supportEmail)}</a>.`,
    ]),
  };
}

export interface ResetData {
  to: string;
  resetUrl: string;
  validMinutes: number;
  supportEmail: string;
}

export function passwordResetEmail(data: ResetData): EmailMessage {
  return {
    to: data.to,
    subject: 'Obnovení hesla ke kurzu',
    text: [
      'Dobrý den,',
      'někdo požádal o obnovení hesla k vašemu účtu. Nové heslo nastavíte na této adrese:',
      data.resetUrl,
      `Odkaz platí ${data.validMinutes} minut a lze ho použít jen jednou.`,
      'Pokud jste o obnovení nežádali, e-mail můžete ignorovat; vaše heslo zůstává beze změny.',
      `Potřebujete pomoc? Napište na ${data.supportEmail}.`,
    ].join('\n\n'),
    html: html([
      'Dobrý den,',
      'někdo požádal o obnovení hesla k vašemu účtu. Nové heslo nastavíte na této adrese:',
      `<a href="${escape(data.resetUrl)}">${escape(data.resetUrl)}</a>`,
      `Odkaz platí ${data.validMinutes} minut a lze ho použít jen jednou.`,
      'Pokud jste o obnovení nežádali, e-mail můžete ignorovat; vaše heslo zůstává beze změny.',
      `Potřebujete pomoc? Napište na <a href="mailto:${escape(data.supportEmail)}">${escape(data.supportEmail)}</a>.`,
    ]),
  };
}
