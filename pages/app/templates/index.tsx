import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import EmptyState from '../../../components/EmptyState';
import { IconCalendar } from '../../../components/design/icons';
import { supabase } from '../../../lib/supabase';
import { activeLocale } from '../../../lib/utils';
import { InlineAddRow } from '../../../components/quickcreate/InlineAddRow';

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((t) => {
              const next3 = nextOccurrences(t, 3);
              return (
                <div
                  key={t.id}
                  className="card p-4 flex flex-col gap-2 hover:bg-ruleSoft/40 transition-colors duration-100"
                >
                  <Link href={`/app/templates/${t.id}`} className="block">
                    <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">
                      {t.cancelled_at ? 'Ended' : 'Active'}
                    </div>
                    <div className="font-display text-base tracking-tighter text-ink leading-tight">
                      {t.student?.name ?? 'Student'}
                    </div>
                    <div className="text-xs text-ink-muted mt-1">
                      {DAY_LABELS[t.day_of_week]}s · {formatTime(t.start_time_local)} · {t.duration_minutes}m
                    </div>
                    <div className="text-2xs text-ink-soft mt-0.5">
                      {RULE_LABELS[t.recurrence_rule]}{t.subject ? ` · ${t.subject}` : ''}
                    </div>
                  </Link>
                  {next3.length > 0 && (
                    <div className="text-2xs text-ink-soft pt-2 border-t border-ruleSoft mt-1 num tabular">
                      Next: {next3.map((d) => formatShortDate(d)).join(' · ')}
                    </div>
                  )}
                  <div className="flex items-center gap-1 pt-1 mt-auto">
                    <Link href={`/app/templates/${t.id}`} className="btn-ghost text-2xs px-2 py-1">Edit</Link>
                    {!t.cancelled_at && (
                      <Link href={`/app/templates/${t.id}#end`} className="btn-ghost text-2xs px-2 py-1 text-claret hover:text-claret">End template</Link>
                    )}
                  </div>
                </div>
              );
            })}
            {!showEnded && (
              <InlineAddRow type="template" label="New template" variant="tile" href="/app/templates/new" />
            )}
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

function formatShortDate(d: Date): string {
  return d.toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' });
}

// Compute the next N occurrence dates for a template by walking forward from
// today and picking dates that fall on the configured day-of-week, respecting
// the recurrence rule.
function nextOccurrences(t: Template, n: number): Date[] {
  const out: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let cursor = new Date(today);
  while (cursor.getDay() !== t.day_of_week) {
    cursor.setDate(cursor.getDate() + 1);
  }
  const stepDays =
    t.recurrence_rule === 'fortnightly' ? 14 :
    t.recurrence_rule === 'monthly' ? 28 : 7;
  for (let i = 0; i < n; i++) {
    out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + stepDays);
  }
  return out;
}

export default function Page() {
  return <AuthGuard><TemplatesInner /></AuthGuard>;
}
