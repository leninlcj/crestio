import type { NextApiRequest, NextApiResponse } from 'next';

// Accepts JSON { message, stack, componentStack, path } and logs with a
// [client-error] prefix so Vercel log search can pick them up. No DB write,
// no response body beyond ok:true. We don't auth this route — anyone can post
// client errors; at worst they fill up logs. Rate limiting is not in scope
// for this endpoint (Vercel's platform handles extreme abuse).

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const message = typeof body.message === 'string' ? body.message.slice(0, 1000) : '';
  const path = typeof body.path === 'string' ? body.path.slice(0, 200) : '';
  const stack = typeof body.stack === 'string' ? body.stack.slice(0, 4000) : '';
  const componentStack =
    typeof body.componentStack === 'string' ? body.componentStack.slice(0, 4000) : '';

  console.error('[client-error]', {
    path,
    message,
    stack,
    componentStack,
    userAgent: req.headers['user-agent']?.slice(0, 200),
  });

  return res.status(200).json({ ok: true });
}
