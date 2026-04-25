import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('lesson_plans');
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
      setError(t('new.errors.subject_topic_required'));
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error(t('new.errors.not_signed_in'));
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
        throw new Error(text
          ? t('new.errors.server_returned_with_text', { status: res.status, text: text.slice(0, 300) })
          : t('new.errors.server_returned', { status: res.status }));
      }
      if (res.status === 429) {
        const hours = typeof payload?.hoursUntilReset === 'number' ? payload.hoursUntilReset : null;
        const fallback = hours == null
          ? t('new.errors.rate_limited_soon', { limit: LESSON_PLAN_DAILY_LIMIT })
          : t('new.errors.rate_limited', { count: hours, limit: LESSON_PLAN_DAILY_LIMIT, hours });
        const msg = payload?.message || fallback;
        setError(msg);
        setUsage({
          used: LESSON_PLAN_DAILY_LIMIT,
          limit: LESSON_PLAN_DAILY_LIMIT,
          hoursUntilReset: hours,
        });
        return;
      }
      if (!res.ok) {
        throw new Error(payload?.error || t('new.errors.server_returned', { status: res.status }));
      }
      const plan = typeof payload?.plan === 'string' ? payload.plan : '';
      if (!plan) {
        throw new Error(t('new.errors.no_plan'));
      }
      setForm({ ...form, content: plan, generated_by_ai: true });
      setPreview(true);
    } catch (e: any) {
      setError(e?.message ?? t('new.errors.generic'));
    } finally {
      setGenerating(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError(t('new.errors.not_signed_in')); setSaving(false); return; }

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
      if (!organizationId) { setError(t('new.errors.no_organisation')); setSaving(false); return; }
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
    if (!window.confirm(t('new.confirm_delete'))) return;
    await supabase.from('lesson_plans').delete().eq('id', existingId);
    router.push('/app/lesson-plans');
  }

  return (
    <Layout
      subtitle={existingId ? t('new.subtitle_edit') : t('new.subtitle_generate')}
      title={existingId ? (form.topic || t('new.title_default_edit')) : t('new.title_new')}
      actions={existingId ? <button onClick={deletePlan} className="btn-danger text-xs">{t('new.delete')}</button> : undefined}
    >
      <form onSubmit={save} className="grid lg:grid-cols-2 gap-6">
        <div className="card p-8 space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('new.form.subject_label')}</label>
              <input required className="input" value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder={t('new.form.subject_placeholder')} />
            </div>
            <div>
              <label className="label">{t('new.form.year_level_label')}</label>
              <input className="input" value={form.year_level}
                onChange={(e) => setForm({ ...form, year_level: e.target.value })}
                placeholder={t('new.form.year_level_placeholder')} />
            </div>
          </div>
          <div>
            <label className="label">{t('new.form.topic_label')}</label>
            <input required className="input" value={form.topic}
              onChange={(e) => setForm({ ...form, topic: e.target.value })}
              placeholder={t('new.form.topic_placeholder')} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('new.form.duration_label')}</label>
              <input type="number" min="15" step="15" className="input" value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">{t('new.form.student_link_label')}</label>
              <select className="input" value={form.student_id}
                onChange={(e) => setForm({ ...form, student_id: e.target.value })}>
                <option value="">{t('new.form.student_none')}</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-ruleSoft">
            <button type="button" onClick={generate} disabled={generating}
              className="btn-primary w-full py-3">
              {generating ? t('new.actions.generating') : (form.content ? t('new.actions.regenerate') : t('new.actions.generate'))}
            </button>
            {usage && usage.used >= 15 && (
              <div className="text-2xs text-ink-soft mt-2 text-center">
                {t('new.usage_line', { used: usage.used, limit: usage.limit })}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">{t('new.form.plan_label')}</label>
              <button type="button" onClick={() => setPreview(!preview)}
                className="text-2xs uppercase tracking-widest text-ink-muted hover:text-ink">
                {preview ? t('new.form.preview_toggle_edit') : t('new.form.preview_toggle_preview')}
              </button>
            </div>
            {preview ? (
              <div className="border border-rule rounded p-5 bg-cream min-h-[16rem] prose-plan"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(form.content || t('new.form.preview_empty')) }} />
            ) : (
              <textarea rows={14} className="input font-mono text-xs" value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder={t('new.form.plan_placeholder')} />
            )}
          </div>

          {error && <div className="text-sm text-claret">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving || !form.content} className="btn-primary">
              {saving ? t('new.actions.saving') : (existingId ? t('new.actions.save_changes') : t('new.actions.save_new'))}
            </button>
            <Link href="/app/lesson-plans" className="btn-ghost">{t('new.actions.cancel')}</Link>
          </div>
        </div>

        <div className="hidden lg:block">
          <div className="card p-8 sticky top-6">
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('new.form.preview_eyebrow')}</div>
            <div className="prose-plan"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(form.content || t('new.form.preview_placeholder')) }} />
          </div>
        </div>
      </form>
    </Layout>
  );
}

export default function NewPlan() {
  return <AuthGuard><NewPlanInner /></AuthGuard>;
}
