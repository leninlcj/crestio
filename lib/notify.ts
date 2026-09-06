// Push notifications to the owner's phone through ntfy (https://ntfy.sh).
//
// Free, no account: the owner installs the ntfy app and subscribes to a topic
// name that only Crestio knows (set as NTFY_TOPIC in Vercel). Every call
// request, tutor application and declined payment then reaches the phone
// within seconds, which is what the "we will call you shortly" promise needs.
// Without NTFY_TOPIC nothing is sent and nothing fails.

export type PushArgs = {
  title: string;
  message: string;
  /** Opened when the notification is tapped. */
  click?: string;
  /** 1 (min) to 5 (urgent). 4 makes the phone buzz. */
  priority?: 1 | 2 | 3 | 4 | 5;
  tags?: string[];
};

export type PushResult = { sent: boolean; reason?: string };

// ntfy headers must be ASCII; the message body may be UTF-8.
function headerSafe(s: string): string {
  return s
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00B7/g, '-')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, 200);
}

export function ntfyEndpoint(env: NodeJS.ProcessEnv = process.env): string | null {
  const topic = (env.NTFY_TOPIC ?? '').trim();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(topic)) return null;
  const base = (env.NTFY_URL ?? 'https://ntfy.sh').replace(/\/+$/, '');
  return `${base}/${topic}`;
}

export async function pushOwner(args: PushArgs, fetchImpl: typeof fetch = fetch): Promise<PushResult> {
  const endpoint = ntfyEndpoint();
  if (!endpoint) return { sent: false, reason: 'not_configured' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const headers: Record<string, string> = {
      Title: headerSafe(args.title) || 'Crestio',
      Priority: String(args.priority ?? 4),
    };
    if (args.click) headers.Click = args.click;
    if (args.tags && args.tags.length > 0) headers.Tags = args.tags.map(headerSafe).filter(Boolean).join(',');
    const res = await fetchImpl(endpoint, { method: 'POST', headers, body: args.message.slice(0, 2000), signal: controller.signal });
    if (!res.ok) return { sent: false, reason: `http_${res.status}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.name : 'error' };
  } finally {
    clearTimeout(timer);
  }
}
