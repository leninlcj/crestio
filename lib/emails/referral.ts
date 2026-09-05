// Email templates for the referral program. Team voice, no founder signoff.
// All templates return { subject, html, text } for sendEmail().

type EmailPayload = { subject: string; html: string; text: string };

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function wrapHtml(body: string): string {
  return `<!doctype html>
<html><body style="font-family:'IBM Plex Sans',system-ui,sans-serif;color:#1A1815;background:#FAF8F4;margin:0;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E8E3DB;border-radius:6px;padding:28px;">
  <div style="font-family:Fraunces,Georgia,serif;font-size:22px;letter-spacing:-0.04em;color:#1A1815;margin-bottom:16px;">
    crest<span style="font-style:italic;color:#1F3A2E;">io</span>
  </div>
  ${body}
  <hr style="border:none;border-top:1px solid #E8E3DB;margin:24px 0;"/>
  <div style="font-size:11px;color:#908A82;line-height:1.6;">
    The Crestio team · <a href="mailto:hello@crestio.ai" style="color:#908A82;">hello@crestio.ai</a>
  </div>
</div>
</body></html>`;
}

function formatAud(cents: number): string {
  // Whole dollars when it divides evenly, two decimals otherwise.
  const dollars = cents / 100;
  const formatter = new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return formatter.format(dollars);
}

// ---------------------------------------------------------------------------
// 7.1 — Referrer: "Your friend joined Crestio"
// ---------------------------------------------------------------------------
export function buildReferrerRewardEmail(args: {
  refereeFirstName: string | null;
  creditAmountCents: number;
}): EmailPayload {
  const name = args.refereeFirstName?.trim() || 'A tutor you referred';
  const amount = formatAud(args.creditAmountCents);
  const subject = `You just earned ${amount} off your next Crestio month`;
  const text =
    `${name} just joined Crestio using your referral code. When their first paid month is processed, ${amount} will be credited toward your next invoice. Thanks for sharing Crestio, we appreciate it.\n\nThe Crestio team`;
  const html = wrapHtml(
    `<h1 style="font-family:Fraunces,serif;font-size:24px;font-weight:500;letter-spacing:-0.04em;margin:0 0 14px 0;">
      Thanks for sharing Crestio.
    </h1>
    <p style="font-size:14px;line-height:1.6;color:#1A1815;">
      <strong>${escapeHtml(name)}</strong> just joined Crestio using your referral code.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#1A1815;">
      When their first paid month is processed, <strong>${amount}</strong> will be credited toward your next invoice. No action needed; the credit applies automatically.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#1A1815;">
      We appreciate it.
    </p>`,
  );
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// 7.2 — Referee: "Welcome — your 25% credit is applied"
// ---------------------------------------------------------------------------
export function buildRefereeWelcomeEmail(args: {
  creditAmountCents: number;
}): EmailPayload {
  const amount = formatAud(args.creditAmountCents);
  const subject = 'Welcome to Crestio: 25% off your first month';
  const text =
    `You signed up using a referral from another Crestio user. Once your trial converts, ${amount} will be automatically applied to your first paid month. Questions? Just reply to this email.\n\nThe Crestio team`;
  const html = wrapHtml(
    `<h1 style="font-family:Fraunces,serif;font-size:24px;font-weight:500;letter-spacing:-0.04em;margin:0 0 14px 0;">
      Welcome to Crestio.
    </h1>
    <p style="font-size:14px;line-height:1.6;color:#1A1815;">
      You signed up using a referral from another Crestio user. Once your trial converts, <strong>${amount}</strong> will be automatically applied to your first paid month. No coupon code to enter.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#1A1815;">
      Questions? Just reply to this email. A person reads every message.
    </p>`,
  );
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// 7.3 — Referrer at-cap warning
// ---------------------------------------------------------------------------
export function buildReferrerAtCapEmail(args: {
  year: number;
  resetDateDisplay: string;
  daysUntilReset: number;
}): EmailPayload {
  const subject = "You've hit this year's referral cap";
  const text =
    `You've earned the maximum 10 referral credits for ${args.year}. Your cap resets on ${args.resetDateDisplay}.\n\nThanks for being one of our most-engaged users. If you have more people to share with, feel free, they'll still get 25% off their first month, and your cap resets in ${args.daysUntilReset} days.\n\nThe Crestio team`;
  const html = wrapHtml(
    `<h1 style="font-family:Fraunces,serif;font-size:24px;font-weight:500;letter-spacing:-0.04em;margin:0 0 14px 0;">
      Cap reached: nicely done.
    </h1>
    <p style="font-size:14px;line-height:1.6;color:#1A1815;">
      You've earned the maximum 10 referral credits for ${args.year}. Your cap resets on <strong>${escapeHtml(args.resetDateDisplay)}</strong>.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#1A1815;">
      Thanks for being one of our most-engaged users. If you have more people to share with, feel free, they'll still get 25% off their first month, and your cap resets in ${args.daysUntilReset} days.
    </p>`,
  );
  return { subject, html, text };
}
