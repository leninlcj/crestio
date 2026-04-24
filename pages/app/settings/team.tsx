import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import SettingsTabs from '../../../components/SettingsTabs';
import { supabase } from '../../../lib/supabase';
import { useOrganization } from '../../../lib/organizationContext';
import { useMembership } from '../../../lib/membershipContext';
import { planAllowsFeature, maxTutorsForPlan } from '../../../lib/billing';
import { useLocaleFormatters } from '../../../lib/useLocaleFormatters';

type TeamMember = { user_id: string; role: string; joined_at: string; email: string | null };
type PendingInvitation = { id: string; email: string; created_at: string; expires_at: string; accept_url?: string };

function TeamInner() {
  const { t } = useTranslation('settings');
  const router = useRouter();
  const { organization } = useOrganization();
  const { membership } = useMembership();
  const { formatDate, formatMoney } = useLocaleFormatters();
  const isOwner = membership?.role === 'owner';
  const planTier = organization?.plan_tier ?? 'solo';
  const multiTutorAllowed = planAllowsFeature(planTier, 'multi_tutor');
  const maxTutors = maxTutorsForPlan(planTier);

  const [team, setTeam] = useState<{
    is_owner: boolean;
    members: TeamMember[];
    pending: PendingInvitation[];
  } | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  useEffect(() => {
    if (membership === null) return;
    if (!isOwner) router.replace('/app/settings/account');
  }, [isOwner, membership, router]);

  async function loadTeam() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch('/api/tutors/team', { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (res.ok) setTeam(await res.json());
  }
  useEffect(() => { loadTeam(); }, []);

  async function inviteTutor(e: FormEvent) {
    e.preventDefault();
    if (!team?.is_owner) return;
    setInviteError(null); setInviteSuccess(false);
    const emailTrim = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      setInviteError(t('team.invite_invalid'));
      return;
    }
    if (team.members.some((m) => (m.email ?? '').toLowerCase() === emailTrim)) {
      setInviteError(t('team.invite_already_member'));
      return;
    }
    if (team.pending.some((p) => p.email.toLowerCase() === emailTrim)) {
      setInviteError(t('team.invite_already_pending'));
      return;
    }
    setInviting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error(t('common.not_signed_in'));
      const res = await fetch('/api/tutors/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ email: emailTrim }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInviteError(payload?.error || t('team.invite_request_failed', { status: res.status }));
        return;
      }
      if (payload?.email_sent === false) {
        setInviteError(t('team.invite_email_failed'));
      } else {
        setInviteSuccess(true);
      }
      setInviteEmail('');
      await loadTeam();
      setTimeout(() => setInviteSuccess(false), 2500);
    } catch (e: any) {
      setInviteError(e?.message ?? t('common.something_wrong'));
    } finally {
      setInviting(false);
    }
  }

  async function revokeInvitation(id: string) {
    if (!window.confirm(t('team.revoke_confirm'))) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/tutors/revoke-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id }),
      });
      if (res.ok) await loadTeam();
    } catch { /* ignore */ }
  }

  const formatShortDate = (iso: string) => {
    try { return formatDate(iso, { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return iso; }
  };

  if (!multiTutorAllowed) {
    const teamPrice = formatMoney(59 * 100, 'AUD', { maximumFractionDigits: 0 });
    return (
      <Layout subtitle={t('tabs.team')} title={t('page_title')}>
        <SettingsTabs />
        <div className="max-w-2xl">
          <div className="card p-10 text-center">
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">{t('team.upgrade_eyebrow')}</div>
            <h2 className="font-display text-2xl tracking-tightest mb-2">{t('team.upgrade_heading')}</h2>
            <p className="text-sm text-ink-muted mb-6 max-w-md mx-auto">
              {t('team.upgrade_body', { price: teamPrice })}
            </p>
            <Link href="/app/onboarding/plan?plan=team" className="btn-primary inline-flex">
              {t('team.upgrade_cta')}
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const tutorCount = team?.members.filter((m) => m.role === 'tutor').length ?? 0;

  return (
    <Layout subtitle={t('tabs.team')} title={t('page_title')}>
      <SettingsTabs />
      <div className="max-w-2xl space-y-6">
        {team && (
          <div className="card p-8 space-y-5">
            <div>
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{t('team.eyebrow')}</div>
              <h2 className="font-display text-xl tracking-tightest">{t('team.heading')}</h2>
              <div className="text-2xs text-ink-soft mt-1">
                {t('team.tutor_count', { count: tutorCount, max: maxTutors })}
              </div>
            </div>

            <div className="space-y-2">
              {team.members.map((m) => (
                <div key={m.user_id} className="flex items-center justify-between text-sm py-1.5 border-b border-rule last:border-b-0">
                  <div>
                    <span className="text-ink">{m.email ?? t('team.unknown_email')}</span>
                    <span className="text-ink-soft ml-2 text-2xs uppercase tracking-widest">{m.role}</span>
                  </div>
                  <span className="text-2xs text-ink-soft">{t('team.joined_prefix', { date: formatShortDate(m.joined_at) })}</span>
                </div>
              ))}
            </div>

            {team.pending.length > 0 && (
              <div className="space-y-2 pt-4">
                <div className="text-2xs uppercase tracking-widest text-ink-muted">{t('team.pending_heading')}</div>
                {team.pending.map((inv) => (
                  <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 text-sm py-1.5">
                    <div>
                      <span className="text-ink">{inv.email}</span>
                      <span className="text-ink-soft ml-2 text-2xs">
                        {t('team.pending_line', { sent: formatShortDate(inv.created_at), expires: formatShortDate(inv.expires_at) })}
                      </span>
                    </div>
                    {team.is_owner && (
                      <div className="flex items-center gap-3">
                        {inv.accept_url && (
                          <button
                            type="button"
                            onClick={async () => {
                              try { await navigator.clipboard.writeText(inv.accept_url!); }
                              catch { window.prompt('Copy this link:', inv.accept_url); }
                            }}
                            className="text-2xs text-ink-muted hover:text-ink underline underline-offset-2"
                          >{t('team.copy_link')}</button>
                        )}
                        <button type="button" onClick={() => revokeInvitation(inv.id)}
                          className="text-2xs text-claret underline underline-offset-2">{t('team.revoke')}</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {team.is_owner && (
              <form onSubmit={inviteTutor} className="pt-4 border-t border-rule space-y-3">
                <div>
                  <label className="label">{t('team.invite_label')}</label>
                  <input type="email" className="input" value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder={t('team.invite_placeholder')} autoComplete="off" />
                </div>
                {inviteError && <div className="text-sm text-claret">{inviteError}</div>}
                {inviteSuccess && <div className="text-sm text-forest">{t('team.invite_sent')}</div>}
                <div>
                  <button type="submit" disabled={inviting || !inviteEmail.trim()} className="btn-primary">
                    {inviting ? t('team.invite_sending') : t('team.invite_send')}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default function Page() {
  return <AuthGuard><TeamInner /></AuthGuard>;
}
