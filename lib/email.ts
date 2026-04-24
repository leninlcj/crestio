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
      from: 'Crestio <hello@crestio.ai>',
      to: [to],
      subject,
      html,
      text,
      replyTo: replyTo || 'hello@crestio.ai',
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
