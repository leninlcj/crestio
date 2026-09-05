import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../design/Toast';
import { formatDate } from '../../lib/utils';
import { TUTOR_AGREEMENT_VERSION } from '../../lib/agencyLegal';

// Vetting and agreement records for a tutor — the child-safe scheme paper
// trail. Owner-only; writes directly through RLS like the rest of the page.

type AnyTutor = Record<string, any>;

export const VETTING_FORM_FIELDS: Array<{ key: string; label: string; type: 'text' | 'date' | 'select' | 'textarea'; placeholder?: string; wide?: boolean; options?: Array<{ value: string; label: string }> }> = [
  { key: 'wwcc_number', label: 'WWCC number', type: 'text', placeholder: 'WWC1234567E' },
  { key: 'wwcc_expiry', label: 'WWCC expiry', type: 'date' },
  { key: 'abn', label: 'ABN', type: 'text', placeholder: '11 digits' },
  { key: 'insurance_expiry', label: 'Public liability insurance expiry', type: 'date' },
  { key: 'suburb', label: 'Suburb', type: 'text' },
  { key: 'mode', label: 'Lessons', type: 'select', options: [{ value: 'online', label: 'Online only' }, { value: 'in_home', label: 'In-home only' }, { value: 'both', label: 'Online and in-home' }] },
  { key: 'levels', label: 'Levels (comma separated)', type: 'text', placeholder: 'Years 7–10, HSC, Extension 2', wide: true },
  { key: 'bio', label: 'Short bio shown to families', type: 'textarea', placeholder: 'Two or three sentences: results, what they teach, how they teach.', wide: true },
];

export function vettingFormFromTutor(t: AnyTutor): Record<string, string> {
  return {
    wwcc_number: t.wwcc_number ?? '',
    wwcc_expiry: t.wwcc_expiry ?? '',
    abn: t.abn ?? '',
    insurance_expiry: t.insurance_expiry ?? '',
    suburb: t.suburb ?? '',
    mode: t.mode ?? '',
    levels: (t.levels ?? []).join(', '),
    bio: t.bio ?? '',
  };
}

export function vettingPatchFromForm(form: Record<string, any>): Record<string, unknown> {
  return {
    wwcc_number: form.wwcc_number ? String(form.wwcc_number).replace(/\s+/g, '').toUpperCase() : null,
    wwcc_expiry: form.wwcc_expiry || null,
    abn: form.abn ? String(form.abn).replace(/\D/g, '') : null,
    insurance_expiry: form.insurance_expiry || null,
    suburb: form.suburb || null,
    mode: form.mode || null,
    levels: String(form.levels ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),
    bio: form.bio || null,
  };
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export function TutorVettingCard({ tutor, onChange }: { tutor: AnyTutor; onChange: (fresh: AnyTutor) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function stamp(field: string, label: string, extra: Record<string, unknown> = {}) {
    setBusy(field);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const patch: Record<string, unknown> = { [field]: new Date().toISOString(), ...extra };
      if (field === 'wwcc_verified_at') patch.wwcc_verified_by = session?.user?.id ?? null;
      const { error } = await supabase.from('tutors').update(patch).eq('id', tutor.id);
      if (error) throw error;
      const { data: fresh } = await supabase.from('tutors').select('*').eq('id', tutor.id).single();
      if (fresh) onChange(fresh);
      toast.show({ message: `${label} recorded.`, tone: 'success' });
    } catch (e: any) {
      toast.show({ message: e?.message ?? 'Could not save.', tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  const wwccDays = daysUntil(tutor.wwcc_expiry);
  const wwccTone = !tutor.wwcc_number ? 'claret' : wwccDays != null && wwccDays < 0 ? 'claret' : wwccDays != null && wwccDays <= 60 ? 'amber' : tutor.wwcc_verified_at ? 'success' : 'amber';
  const insDays = daysUntil(tutor.insurance_expiry);

  const Row = ({ label, value, ok, action, actionLabel, field }: { label: string; value: string; ok: boolean; action?: () => void; actionLabel?: string; field?: string }) => (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-rule last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm text-ink">{label}</div>
        <div className={`text-2xs ${ok ? 'text-ink-soft' : 'text-claret'}`}>{value}</div>
      </div>
      {action && !ok && (
        <button type="button" onClick={action} disabled={busy === field} className="btn-secondary text-xs shrink-0">{busy === field ? 'Saving…' : actionLabel}</button>
      )}
      {ok && <span className="pill pill-success shrink-0">Done</span>}
    </div>
  );

  const cleared = !!tutor.wwcc_number && !!tutor.wwcc_verified_at && (wwccDays == null || wwccDays >= 0) && !!tutor.id_checked_at && !!tutor.agreement_accepted_at && !!tutor.conduct_accepted_at && !!tutor.training_completed_at;

  return (
    <div className="card p-6 mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="text-2xs uppercase tracking-widest text-ink-muted">Vetting and agreements</div>
        <span className={`pill ${cleared ? 'pill-success' : 'pill-amber'}`}>{cleared ? 'Cleared to teach' : 'Not yet cleared'}</span>
      </div>
      <div>
        <Row
          label="Working With Children Check"
          field="wwcc_verified_at"
          value={
            !tutor.wwcc_number ? 'No WWCC number on file. Add it in Edit.'
            : wwccDays != null && wwccDays < 0 ? `Expired ${formatDate(tutor.wwcc_expiry)}. Stand down until renewed.`
            : tutor.wwcc_verified_at ? `${tutor.wwcc_number} · verified ${formatDate(tutor.wwcc_verified_at)}${tutor.wwcc_expiry ? ` · expires ${formatDate(tutor.wwcc_expiry)}` : ''}${wwccDays != null && wwccDays <= 60 ? ` · ${wwccDays} days left` : ''}`
            : `${tutor.wwcc_number} on file. Verify it at the Office of the Children's Guardian, then record it here.`
          }
          ok={!!tutor.wwcc_number && !!tutor.wwcc_verified_at && !(wwccDays != null && wwccDays < 0) && wwccTone !== 'amber'}
          action={tutor.wwcc_number ? () => stamp('wwcc_verified_at', 'WWCC verification') : undefined}
          actionLabel="Mark verified today"
        />
        <Row label="Photo ID sighted" field="id_checked_at" value={tutor.id_checked_at ? `Checked ${formatDate(tutor.id_checked_at)}` : 'Not yet'} ok={!!tutor.id_checked_at} action={() => stamp('id_checked_at', 'ID check')} actionLabel="Mark checked" />
        <Row label="Referees spoken to" field="references_checked_at" value={tutor.references_checked_at ? `Checked ${formatDate(tutor.references_checked_at)}` : 'Not yet'} ok={!!tutor.references_checked_at} action={() => stamp('references_checked_at', 'Reference check')} actionLabel="Mark checked" />
        <Row label="Child-safe e-learning (OCG)" field="training_completed_at" value={tutor.training_completed_at ? `Completed ${formatDate(tutor.training_completed_at)}` : 'Not yet. The tutor sends you the certificate'} ok={!!tutor.training_completed_at} action={() => stamp('training_completed_at', 'Training')} actionLabel="Mark completed" />
        <Row label="Tutor agreement" value={tutor.agreement_accepted_at ? `Accepted ${formatDate(tutor.agreement_accepted_at)} (v${tutor.agreement_version ?? TUTOR_AGREEMENT_VERSION})` : 'Not yet. The tutor accepts it on first sign-in to the app'} ok={!!tutor.agreement_accepted_at} />
        <Row label="Code of conduct" value={tutor.conduct_accepted_at ? `Accepted ${formatDate(tutor.conduct_accepted_at)}` : 'Not yet. Accepted with the agreement'} ok={!!tutor.conduct_accepted_at} />
        <Row label="Public liability insurance" value={tutor.insurance_expiry ? `Expires ${formatDate(tutor.insurance_expiry)}${insDays != null && insDays < 0 ? ' (expired)' : ''}` : 'Not recorded (required for in-home lessons unless the agency policy covers tutors)'} ok={!!tutor.insurance_expiry && !(insDays != null && insDays < 0)} />
        <Row label="ABN" value={tutor.abn ? tutor.abn : 'Not recorded. Without an ABN, 47% must be withheld from payments'} ok={!!tutor.abn} />
      </div>
      {(tutor.suburb || tutor.mode || (tutor.levels ?? []).length > 0 || tutor.bio) && (
        <div className="mt-4 pt-4 border-t border-rule text-sm text-ink-muted space-y-1">
          <div>{[tutor.suburb, tutor.mode === 'both' ? 'Online and in-home' : tutor.mode === 'in_home' ? 'In-home' : tutor.mode === 'online' ? 'Online' : null, (tutor.levels ?? []).join(', ')].filter(Boolean).join(' · ')}</div>
          {tutor.bio && <p className="leading-relaxed">{tutor.bio}</p>}
        </div>
      )}
    </div>
  );
}
