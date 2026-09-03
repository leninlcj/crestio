import { Resend } from 'resend';

type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

type SendEmailResult = {
  success: boolean;
  id?: string;
  error?: string;
};

let client: Resend | null = null;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
}: SendEmailArgs): Promise<SendEmailResult> {
  const resend = getClient();
  if (!resend) {
    console.error('[email] RESEND_API_KEY not configured — email not sent');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Crestio Tutoring <hello@crestio.ai>',
      to: [to],
      subject,
      html,
      text,
      // Until hello@crestio.ai has an inbox, replies route to the owner so
      // nothing a family writes back is lost.
      replyTo: replyTo || process.env.EMAIL_REPLY_TO || process.env.OWNER_ALERT_EMAIL || 'leninlcj@gmail.com',
    });

    if (result.error) {
      console.error('[email] Resend returned error:', result.error);
      return {
        success: false,
        error: result.error.message ?? JSON.stringify(result.error),
      };
    }

    return { success: true, id: result.data?.id };
  } catch (err: any) {
    console.error('[email] send threw:', err);
    return {
      success: false,
      error: typeof err?.message === 'string' ? err.message : 'Unknown email error',
    };
  }
}
