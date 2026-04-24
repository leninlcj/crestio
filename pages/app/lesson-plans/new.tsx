import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { getCurrentOrganizationId } from '../../../lib/organization';
import { useMembership } from '../../../lib/membershipContext';
import { Student } from '../../../lib/types';
import { LESSON_PLAN_DAILY_LIMIT } from '../../../lib/rateLimits';

type Usage = { used: number; limit: number; hoursUntilReset: number | null };

function renderMarkdown(md: string): string {
  // Small, safe-ish markdown renderer for headings, lists, bold, italic, paragraphs.
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = md.split('\n');
  const out: string[] = [];
  let inUl = false, inOl = false;

  const closeLists = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };

  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeLists(); continue; }
    if (/^### /.test(line)) { closeLists(); out.push(`<h3>${inline(line.slice(4))}</h3>`); continue; }
    if (/^## /.test(line))  { closeLists(); out.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
    if (/^# /.test(line))   { closeLists(); out.push(`<h1>${inline(line.slice(2))}</h1>`); continue; }
    if (/^[-*] /.test(line)) {
      if (!inUl) { closeLists(); out.push('<ul>'); inUl = true; }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    if (/^\d+\. /.test(line)) {
      if (!inOl) { closeLists(); out.push('<ol>'); inOl = true; }
      out.push(`<li>${inline(line.replace(/^\d+\. /, ''))}</li>`);
      continue;
    }
    closeLists();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeLists();
  return out.join('\n');
}

function NewPlanInner() {
  const router = useRouter();
  const existingId = typeof router.query.id === 'string' ? router.query.id : null;

  const [students, setStudents] = useState<Student[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  async function fetchUsage() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/lesson-plan-usage', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const payload = (await res.json()) as Usage;
      setUsage(payload);
    } catch {
      // Non-critical — indicator simply won't render
    }
  }

  useEffect(() => {
    fetchUsage();
  }, []);

  const [form, setForm] = useState({
    subject: '',
    topic: '',
    year_level: '',
    duration_minutes: 60,
    student_id: '',
    content: '',
    generated_by_ai: false,
  });
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('students').select('*').eq('archived', false).order('name');
      setStudents(data ?? []);

      if (existingId) {
        const { data: plan } = await supabase.from('lesson_plans').select('*').eq('id', existingId).single();
        if (plan) {
          setForm({
            subject: plan.subject,
            topic: plan.topic,
            year_level: plan.year_level ?? '',
            duration_minutes: plan.duration_minutes,
            student_id: plan.student_id ?? '',
            content: plan.content,
            generated_by_ai: plan.generated_by_ai,
          });
          setPreview(true);
        }
      }
    })();
  }, [existingId]);

  async function generate() {
    if (!form.subject || !form.topic) {
      setError('Subject and topic are required to generate.');
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not signed in.');
      }
      const res = await fetch('/api/generate-lesson-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          subject: form.subject,
          topic: form.topic,
          yearLevel: form.year_level,
          duration: form.duration_minutes,
        }),
      });
      let payload: any = null;
      try {
        payload = await res.json();
      } catch {
        const text = await res.text().catch(() => '');
        throw new Error(`Server returned ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}`);
      }
      if (res.status === 429) {
        const hours = typeof payload?.hoursUntilReset === 'number' ? payload.hoursUntilReset : null;
        const msg =
          payload?.message ||
          `You've generated ${LESSON_PLAN_DAILY_LIMIT} lesson plans in the last 24 hours. You can generate more${hours ? ` in ${hours} hour${hours === 1 ? '' : 's'}` : ' soon'}.`;
        setError(msg);
        setUsage({
          used: LESSON_PLAN_DAILY_LIMIT,
          limit: LESSON_PLAN_DAILY_LIMIT,
          hoursUntilReset: hours,
        });
        return;
      }
      if (!res.ok) {
        throw new Error(payload?.error || `Server returned ${res.status}`);
      }
      const plan = typeof payload?.plan === 'string' ? payload.plan : '';
      if (!plan) {
        throw new Error('Server returned no plan.');
      }
      setForm({ ...form, content: plan, generated_by_ai: true });
      setPreview(true);
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong.');
    } finally {
      setGenerating(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError('Not signed in.'); setSaving(false); return; }

    if (existingId) {
      const { error: err } = await supabase.from('lesson_plans').update({
        subject: form.subject,
        topic: form.topic,
        year_level: form.year_level || null,
        duration_minutes: form.duration_minutes,
        student_id: form.student_id || null,
        content: form.content,
      }).eq('id', existingId);
      setSaving(false);
      if (err) { setError(err.message); return; }
      router.push('/app/lesson-plans');
    } else {
      const organizationId = await getCurrentOrganizationId();
      if (!organizationId) { setError('No organisation is linked to your account. Contact support@crestio.ai.'); setSaving(false); return; }
      const { data, error: err } = await supabase.from('lesson_plans').insert({
        owner_id: session.user.id,
        organization_id: organizationId,
        subject: form.subject,
        topic: form.topic,
        year_level: form.year_level || null,
        duration_minutes: form.duration_minutes,
        student_id: form.student_id || null,
        content: form.content,
        generated_by_ai: form.generated_by_ai,
      }).select().single();
      setSaving(false);
      if (err) { setError(err.message); return; }
      router.push(`/app/lesson-plans/new?id=${data.id}`);
    }
  }

  async function deletePlan() {
    if (!existingId) return;
    if (!window.confirm('Delete this lesson plan?')) return;
    await supabase.from('lesson_plans').delete().eq('id', existingId);
    router.push('/app/lesson-plans');
  }

  return (
    <Layout
      subtitle={existingId ? 'Edit plan' : 'Generate plan'}
      title={existingId ? (form.topic || 'Lesson plan') : 'New lesson plan'}
      actions={existingId ? <button onClick={deletePlan} className="btn-danger text-xs">Delete</button> : undefined}
    >
      <form onSubmit={save} className="grid lg:grid-cols-2 gap-6">
        <div className="card p-8 space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Subject *</label>
              <input required className="input" value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="e.g. Maths Advanced" />
            </div>
            <div>
              <label className="label">Year level</label>
              <input className="input" value={form.year_level}
                onChange={(e) => setForm({ ...form, year_level: e.target.value })}
                placeholder="e.g. Year 11" />
            </div>
          </div>
          <div>
            <label className="label">Topic *</label>
            <input required className="input" value={form.topic}
              onChange={(e) => setForm({ ...form, topic: e.target.value })}
              placeholder="e.g. Introduction to integration by parts" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Duration (minutes)</label>
              <input type="number" min="15" step="15" className="input" value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Link to student (optional)</label>
              <select className="input" value={form.student_id}
                onChange={(e) => setForm({ ...form, student_id: e.target.value })}>
                <option value="">—</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-ruleSoft">
            <button type="button" onClick={generate} disabled={generating}
              className="btn-primary w-full py-3">
              {generating ? 'Generating plan…' : (form.content ? 'Regenerate plan' : 'Generate plan')}
            </button>
            {usage && usage.used >= 15 && (
              <div className="text-2xs text-ink-soft mt-2 text-center">
                {usage.used} of {usage.limit} daily generations used.
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Plan (markdown)</label>
              <button type="button" onClick={() => setPreview(!preview)}
                className="text-2xs uppercase tracking-widest text-ink-muted hover:text-ink">
                {preview ? 'Edit' : 'Preview'}
              </button>
            </div>
            {preview ? (
              <div className="border border-rule rounded p-5 bg-cream min-h-[16rem] prose-plan"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(form.content || '_Nothing yet. Generate one or paste your own._') }} />
            ) : (
              <textarea rows={14} className="input font-mono text-xs" value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="# Lesson plan&#10;&#10;## Objectives&#10;- …" />
            )}
          </div>

          {error && <div className="text-sm text-claret">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving || !form.content} className="btn-primary">
              {saving ? 'Saving…' : (existingId ? 'Save changes' : 'Save plan')}
            </button>
            <Link href="/app/lesson-plans" className="btn-ghost">Cancel</Link>
          </div>
        </div>

        <div className="hidden lg:block">
          <div className="card p-8 sticky top-6">
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Preview</div>
            <div className="prose-plan"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(form.content || '_Your plan will preview here._') }} />
          </div>
        </div>
      </form>
    </Layout>
  );
}

export default function NewPlan() {
  return <AuthGuard><NewPlanInner /></AuthGuard>;
}
