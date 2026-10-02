/**
 * Single-action transactional email: one message, one button.
 *
 * Password reset, email verification, team invites, and sale notifications all
 * share this shape, so they share one template. Inline styles only, because
 * most mail clients strip <style> blocks; table layout, because Outlook still
 * renders with Word.
 */

export type RenderActionEmailInput = {
  readonly subject: string
  /** The preview line most clients show next to the subject. */
  readonly preheader: string
  readonly heading: string
  readonly paragraphs: readonly string[]
  readonly action?: { readonly label: string; readonly url: string } | undefined
  /** Small print under the button, e.g. when the link expires. */
  readonly footnote?: string | undefined
  readonly brand?: string | undefined
}

export type RenderedActionEmail = {
  readonly subject: string
  readonly html: string
  readonly text: string
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function renderActionEmail(input: RenderActionEmailInput): RenderedActionEmail {
  const brand = input.brand ?? 'CreatorHub'
  const paragraphsHtml = input.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#3f3f46;">${escapeHtml(p)}</p>`,
    )
    .join('')

  const buttonHtml = input.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;"><tr><td style="border-radius:10px;background:#18181b;">
        <a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(input.action.label)}</a>
      </td></tr></table>
      <p style="margin:0 0 16px 0;font-size:12px;line-height:1.5;color:#71717a;">If the button does not work, paste this link into your browser:<br><span style="word-break:break-all;color:#52525b;">${escapeHtml(input.action.url)}</span></p>`
    : ''

  const footnoteHtml = input.footnote
    ? `<p style="margin:0;font-size:12px;line-height:1.5;color:#71717a;">${escapeHtml(input.footnote)}</p>`
    : ''

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;">
<tr><td style="padding:32px 32px 8px 32px;">
<p style="margin:0 0 24px 0;font-size:13px;font-weight:700;letter-spacing:0.02em;color:#18181b;">${escapeHtml(brand)}</p>
<h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;font-weight:700;color:#09090b;">${escapeHtml(input.heading)}</h1>
${paragraphsHtml}
${buttonHtml}
${footnoteHtml}
</td></tr>
<tr><td style="padding:24px 32px 32px 32px;"><p style="margin:0;font-size:11px;color:#a1a1aa;">Sent by CreatorHub on behalf of ${escapeHtml(brand)}.</p></td></tr>
</table></td></tr></table>
</body></html>`

  const text = [
    input.heading,
    '',
    ...input.paragraphs,
    ...(input.action ? ['', `${input.action.label}: ${input.action.url}`] : []),
    ...(input.footnote ? ['', input.footnote] : []),
  ].join('\n')

  return { subject: input.subject, html, text }
}
