import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import EmptyState from '../../../components/EmptyState';
import { IconCalendar } from '../../../components/design/icons';
import { supabase } from '../../../lib/supabase';
import { activeLocale } from '../../../lib/utils';

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const RULE_LABELS: Record<'weekly' | 'fortnightly' | 'monthly', string> = {
  weekly: 'every week',
  fortnightly: 'every fortnight',
  monthly: 'every 4 weeks',
};

type Template = {
  id: string;
  subject: string | null;
  duration_minutes: number;
  recurrence_rule: 'weekly' | 'fortnightly' | 'monthly';
  day_of_week: number;
  start_time_local: string;
  effective_from: string;
  cancelled_at: string | null;
  generated_through_date: string | null;
  student?: { id: string; name: string };
};

function TemplatesInner() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showEnded, setShowEnded] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError('Not signed in.'); setLoading(false); return; }
    const res = await fetch('/api/session-templates', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json?.error ?? 'Could not load templates.'); setLoading(false); return; }
    setTemplates((json.templates ?? []) as Template[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = showEnded
    ? templates.filter((t) => !!t.cancelled_at)
    : templates.filter((t) => !t.cancelled_at);

  return (
    <Layout
      title="Recurring sessions"
      subtitle="Templates auto-generate 8 weeks ahead"
      actions={<Link href="/app/templates/new" className="btn-primary">New template</Link>}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setShowEnded(false)}
            className={(showEnded ? 'btn-ghost ' : 'btn-secondary ') + 'text-xs px-3 py-1.5'}
          >Active</button>
          <button
            onClick={() => setShowEnded(true)}
            className={(!showEnded ? 'btn-ghost ' : 'btn-secondary ') + 'text-xs px-3 py-1.5'}
          >Ended</button>
        </div>

        {error && <div className="card p-4 text-sm text-claret">{error}</div>}

        {loading ? (
          <div className="card p-6 text-sm text-ink-muted">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<IconCalendar />}
            title={showEnded ? 'No ended templates' : 'No recurring sessions'}
            description={
              showEnded
                ? 'When you end a template, it will appear here.'
                : 'Create a template once. We generate the next 8 weeks of sessions automatically — and refresh daily so the calendar stays full.'
            }
            action={!showEnded ? <Link href="/app/templates/new" className="btn-primary">Create your first</Link> : undefined}
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((t) => (
              <Link
                key={t.id}
                href={`/app/templates/${t.id}`}
                className="card p-5 block transition-colors hover:border-rule/80"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">
                      {t.cancelled_at ? 'Ended' : 'Active'}
                    </div>
                    <h2 className="font-display text-xl tracking-tightest text-ink">
                      {t.student?.name ?? 'Student'} — {DAY_LABELS[t.day_of_week]}s at {formatTime(t.start_time_local)}
                    </h2>
                    <div className="text-sm text-ink-muted mt-1">
                      {RULE_LABELS[t.recurrence_rule]} · {t.duration_minutes} min
                      {t.subject ? ` · ${t.subject}` : ''}
                    </div>
                    {t.generated_through_date && (
                      <div className="text-2xs text-ink-soft mt-2">
                        Sessions generated through {formatDate(t.generated_through_date)}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function formatTime(hms: string): string {
  const [hh, mm] = hms.split(':');
  const d = new Date();
  d.setHours(Number(hh), Number(mm), 0, 0);
  return d.toLocaleTimeString(activeLocale(), { hour: 'numeric', minute: '2-digit' });
}
function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(activeLocale(), {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function Page() {
  return <AuthGuard><TemplatesInner /></AuthGuard>;
}
