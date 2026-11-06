import { escapeHtml, layout } from '@/mail/templates/format';
import type { MailContent } from '@/mail/types/mail.types';

/**
 * A link to a page of the site that carries `token` in the fragment
 * (`#token=…`): browsers never send the fragment to a server, so the token
 * stays out of access logs and `Referer` headers. The page reads it and
 * POSTs it to the API. Only the origin of `frontendUrl` counts: a path in
 * it is replaced by `path`.
 */
export function accountLink(
  frontendUrl: string,
  path: string,
  token: string,
): string {
  const url = new URL(path, frontendUrl);
  url.hash = `token=${token}`;
  return url.toString();
}

/** The reset link, to the account's own address only. */
export function passwordResetEmail(link: string): MailContent {
  const subject = 'Відновлення пароля';
  const intro =
    'Щоб задати новий пароль, відкрийте посилання. Воно діє 1 годину ' +
    'і спрацює лише один раз.';
  const ignore =
    'Якщо ви не просили відновити пароль, просто проігноруйте цей лист: ' +
    'ваш пароль не зміниться.';

  return {
    subject,
    text: [subject, '', intro, '', link, '', ignore].join('\n'),
    html: layout(
      subject,
      `<h2>${escapeHtml(subject)}</h2>\n<p>${intro}</p>\n` +
        `<p><a href="${escapeHtml(link)}">Задати новий пароль</a></p>\n` +
        `<p style="color:#888">${ignore}</p>`,
    ),
  };
}
