// Sunday weekly digest — plain HTML, max 600px, table-based layout for
// older email clients. No CSS variables, no media queries beyond
// @media (max-width: 600px) for stacking.

export type WeeklyDigestData = {
  tutor_first_name: string;
  sessions_count: number;
  hours: number;
  earned_label: string;
  earned_cents: number;
  per_day_counts: number[];      // 7 days, Mon-Sun
  nudges: string[];               // 1-3 nudges
  app_url: string;                // base URL for CTA
};

export function renderWeeklyDigestHTML(d: WeeklyDigestData): { subject: string; html: string; text: string } {
  const subject = `Your week: ${d.sessions_count} ${d.sessions_count === 1 ? 'session' : 'sessions'}, ${d.hours}h, ${d.earned_label}`;

  const max = Math.max(1, ...d.per_day_counts);
  const bars = d.per_day_counts.map((n, i) => {
    const h = Math.round((n / max) * 36);
    const day = ['M','T','W','T','F','S','S'][i];
    return `<td align="center" valign="bottom" style="padding:0 4px;">
      <div style="background-color:#1F3A2E;width:18px;height:${Math.max(2, h)}px;border-radius:2px;"></div>
      <div style="font-family:Arial,sans-serif;font-size:10px;color:#70746F;margin-top:6px;">${day}</div>
      <div style="font-family:Arial,sans-serif;font-size:11px;color:#0F1714;font-weight:600;margin-top:2px;">${n}</div>
    </td>`;
  }).join('');

  const nudgesHTML = d.nudges.length === 0
    ? `<p style="font-size:14px;color:#5F635E;margin:0;">All caught up. Enjoy the rest of your Sunday.</p>`
    : `<ul style="margin:0;padding-left:20px;color:#0F1714;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;">
        ${d.nudges.map((n) => `<li style="margin-bottom:6px;">${escapeHtml(n)}</li>`).join('')}
      </ul>`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#FAFAF8;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#FAFAF8;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background-color:#FFFFFF;border:1px solid #EAEAE6;border-radius:8px;">
<tr><td style="padding:32px 32px 0;">
  <p style="font-family:Arial,sans-serif;font-size:13px;color:#70746F;margin:0 0 8px;text-transform:uppercase;letter-spacing:1.5px;">Sunday digest</p>
  <h1 style="font-family:Georgia,serif;font-size:28px;color:#0F1714;margin:0 0 6px;font-weight:600;letter-spacing:-0.5px;">Hi ${escapeHtml(d.tutor_first_name)}, your week.</h1>
</td></tr>
<tr><td style="padding:24px 32px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td width="33%" style="padding-right:8px;">
        <div style="font-family:Arial,sans-serif;font-size:11px;color:#5F635E;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:4px;">Sessions</div>
        <div style="font-family:Georgia,serif;font-size:28px;color:#0F1714;font-weight:600;">${d.sessions_count}</div>
      </td>
      <td width="33%" style="padding:0 8px;">
        <div style="font-family:Arial,sans-serif;font-size:11px;color:#5F635E;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:4px;">Hours</div>
        <div style="font-family:Georgia,serif;font-size:28px;color:#0F1714;font-weight:600;">${d.hours}h</div>
      </td>
      <td width="33%" style="padding-left:8px;">
        <div style="font-family:Arial,sans-serif;font-size:11px;color:#5F635E;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:4px;">Earned</div>
        <div style="font-family:Georgia,serif;font-size:28px;color:#0F1714;font-weight:600;">${escapeHtml(d.earned_label)}</div>
      </td>
    </tr>
  </table>
</td></tr>

<tr><td style="padding:32px 32px 16px;">
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#5F635E;margin:0 0 12px;text-transform:uppercase;letter-spacing:1.2px;">By day</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr style="height:60px;vertical-align:bottom;">${bars}</tr>
  </table>
</td></tr>

<tr><td style="padding:24px 32px;">
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#5F635E;margin:0 0 12px;text-transform:uppercase;letter-spacing:1.2px;">Worth a look</p>
  ${nudgesHTML}
</td></tr>

<tr><td align="center" style="padding:24px 32px 32px;">
  <a href="${escapeHtml(d.app_url)}" style="display:inline-block;background-color:#1F3A2E;color:#FAFAF8;font-family:Arial,sans-serif;font-size:14px;font-weight:500;text-decoration:none;padding:12px 24px;border-radius:8px;">Plan next week →</a>
</td></tr>

<tr><td style="padding:0 32px 32px;text-align:center;border-top:1px solid #EAEAE6;padding-top:24px;">
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#70746F;margin:0;">
    Sent by Crestio. <a href="${escapeHtml(d.app_url)}/app/settings/notifications" style="color:#70746F;">Manage email preferences</a>.
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  const text = [
    `Hi ${d.tutor_first_name},`,
    '',
    `Your week: ${d.sessions_count} ${d.sessions_count === 1 ? 'session' : 'sessions'}, ${d.hours} hours, ${d.earned_label}.`,
    '',
    ...(d.nudges.length === 0 ? ['All caught up. Enjoy the rest of your Sunday.'] : ['Worth a look:', ...d.nudges.map((n) => `- ${n}`)]),
    '',
    `Plan next week: ${d.app_url}/app`,
  ].join('\n');

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
