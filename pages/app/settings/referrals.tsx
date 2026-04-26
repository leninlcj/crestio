import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation, Trans } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import SettingsTabs from '../../../components/SettingsTabs';
import { supabase } from '../../../lib/supabase';
import { useMembership } from '../../../lib/membershipContext';
import { Badge } from '../../../components/design/Badge';
import { activeLocale } from '../../../lib/utils';

type MeResponse = {
  code: string;
  share_link: string;
  stats: { total_sent: number; pending: number; converted: number; rejected: number };
  credits_earned_cents: number;
  credits_available_cents: number;
  credits_applied_cents: number;
  max_referrals_per_year: number;
  referrals_this_year: number;
  referrals_remaining_this_year: number;
};

type Conversion = {
  id: string;
  status: 'pending' | 'converted' | 'rejected' | 'expired' | string;
  signed_up_at: string;
  converted_at: string | null;
  rejection_reason: string | null;
  credit_earned_cents: number | null;
};

type Credit = {
  id: string;
  amount_cents: number;
  currency: string;
  source: 'referral_bonus' | 'referral_welcome' | 'manual_adjustment' | string;
  issued_at: string;
  expires_at: string;
  applied_at: string | null;
  stripe_invoice_id: string | null;
};

type HistoryResponse = { conversions: Conversion[]; credits: Credit[] };

function formatAud(cents: number): string {
  return new Intl.NumberFormat(activeLocale(), {
    style: 'currency', currency: 'AUD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

function useRelativeDate() {
  const { t } = useTranslation('settings');
  return (iso: string): string => {
    const now = Date.now();
    const ts = new Date(iso).getTime();
    const days = Math.floor((now - ts) / 86_400_000);
    if (days === 0) return t('referrals_page.relative.today');
    if (days === 1) return t('referrals_page.relative.yesterday');
    if (days < 7) return t('referrals_page.relative.days_ago', { count: days });
    if (days < 14) return t('referrals_page.relative.weeks_ago', { count: 1 });
    if (days < 30) return t('referrals_page.relative.weeks_ago', { count: Math.floor(days / 7) });
    return new Date(iso).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  };
}

function ReferralsInner() {
  const { t } = useTranslation('settings');
  const router = useRouter();
  const { membership } = useMembership();
  const isOwner = membership?.role === 'owner';
  const relativeDate = useRelativeDate();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<'code' | 'link' | 'message' | null>(null);

  useEffect(() => {
    if (membership === null) return;
    if (!isOwner) router.replace('/app/settings/account');
  }, [isOwner, membership, router]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setLoading(false); return; }
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [meRes, histRes] = await Promise.all([
        fetch('/api/referrals/me', { headers }),
        fetch('/api/referrals/history', { headers }),
      ]);
      if (meRes.ok) setMe(await meRes.json());
      if (histRes.ok) setHistory(await histRes.json());
      setLoading(false);
    })();
  }, []);

  async function copy(kind: 'code' | 'link' | 'message', value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied((c) => (c === kind ? null : c)), 2000);
    } catch {
      window.prompt(t('referrals_page.copy_prompt'), value);
    }
  }

  if (loading || !me) {
    return (
      <Layout pageTitle={`${t('tabs.referrals')} · ${t('page_title')}`} subtitle={t('referrals_page.page.subtitle')} title={t('referrals_page.page.title')}>
        <SettingsTabs />
        <div className="card p-6 text-sm text-ink-muted">{t('referrals_page.loading')}</div>
      </Layout>
    );
  }

  const messageTemplate = t('referrals_page.message_template', { link: me.share_link });
  const atCap = me.referrals_remaining_this_year <= 0;

  return (
    <Layout pageTitle={`${t('tabs.referrals')} · ${t('page_title')}`} subtitle={t('referrals_page.page.subtitle')} title={t('referrals_page.page.title')}>
      <SettingsTabs />

      <div className="max-w-3xl space-y-6">
        {/* Top: share card */}
        <div className="card p-8 space-y-5">
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{t('referrals_page.share.eyebrow')}</div>
            <h2 className="font-display text-2xl md:text-3xl tracking-tightest text-ink mb-2">
              {t('referrals_page.share.heading')}
            </h2>
            <p className="text-sm text-ink-muted leading-relaxed">
              {t('referrals_page.share.body')}
            </p>
          </div>

          <div>
            <label className="label">{t('referrals_page.share.code_label')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={me.code}
                className="input font-mono tracking-wide uppercase flex-1"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => copy('code', me.code)}
                className="btn-secondary text-xs px-4"
              >
                {copied === 'code' ? t('referrals_page.share.copied') : t('referrals_page.share.copy')}
              </button>
            </div>
          </div>

          <div>
            <label className="label">{t('referrals_page.share.link_label')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={me.share_link}
                className="input text-sm flex-1"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => copy('link', me.share_link)}
                className="btn-secondary text-xs px-4"
              >
                {copied === 'link' ? t('referrals_page.share.copied') : t('referrals_page.share.copy')}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-rule">
            <button
              type="button"
              onClick={() => copy('message', messageTemplate)}
              className="btn-ghost text-xs"
            >
              {copied === 'message' ? t('referrals_page.share.message_copied') : t('referrals_page.share.copy_message')}
            </button>
            <a
              href={`mailto:?subject=${encodeURIComponent(t('referrals_page.share.email_subject'))}&body=${encodeURIComponent(messageTemplate)}`}
              className="btn-ghost text-xs"
            >
              {t('referrals_page.share.share_email')}
            </a>
          </div>
        </div>

        {/* Middle: stats + history */}
        <div className="card p-8 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{t('referrals_page.history.eyebrow')}</div>
              <h2 className="font-display text-xl tracking-tightest">{t('referrals_page.history.heading')}</h2>
            </div>
            <div className="text-2xs text-ink-soft">
              <Trans
                ns="settings"
                i18nKey="referrals_page.history.usage_line"
                values={{ used: me.referrals_this_year, max: me.max_referrals_per_year }}
                components={{ bold: <strong /> }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center py-2">
            <Stat label={t('referrals_page.history.stat_sent')} value={me.stats.total_sent} />
            <Stat label={t('referrals_page.history.stat_converted')} value={me.stats.converted} tone="success" />
            <Stat label={t('referrals_page.history.stat_pending')} value={me.stats.pending} tone="warning" />
          </div>

          {atCap && (
            <div className="text-xs text-amber-ink bg-amber-soft/50 border border-amber/40 rounded p-3">
              {t('referrals_page.history.at_cap')}
            </div>
          )}

          {history?.conversions && history.conversions.length > 0 ? (
            <ul className="divide-y divide-ruleSoft">
              {history.conversions.map((c) => (
                <li key={c.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm text-ink">{t('referrals_page.history.row_title')}</div>
                    <div className="text-2xs text-ink-soft">
                      {t('referrals_page.history.signed_up_prefix', { when: relativeDate(c.signed_up_at) })}
                      {c.status === 'converted' && c.converted_at
                        ? t('referrals_page.history.converted_suffix', { when: relativeDate(c.converted_at) })
                        : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.credit_earned_cents != null && c.credit_earned_cents > 0 && (
                      <span className="text-xs text-forest-ink font-medium">
                        {t('referrals_page.history.earned_suffix', { amount: formatAud(c.credit_earned_cents) })}
                      </span>
                    )}
                    <ConversionBadge status={c.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-ink-muted text-center py-6">
              {t('referrals_page.history.empty')}
            </div>
          )}
        </div>

        {/* Bottom: credits */}
        <div className="card p-8 space-y-5">
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{t('referrals_page.credits.eyebrow')}</div>
            <h2 className="font-display text-xl tracking-tightest">{t('referrals_page.credits.heading')}</h2>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="font-display text-4xl tracking-tightest text-ink">
              {formatAud(me.credits_available_cents)}
            </span>
            <span className="text-sm text-ink-muted">{t('referrals_page.credits.available_suffix')}</span>
          </div>
          <div className="text-xs text-ink-muted -mt-3">
            {t('referrals_page.credits.footnote')}
          </div>

          {history?.credits && history.credits.length > 0 ? (
            <div className="pt-3 border-t border-rule">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('referrals_page.credits.history_eyebrow')}</div>
              <ul className="divide-y divide-ruleSoft text-sm">
                {history.credits.map((c) => {
                  const expired = !c.applied_at && new Date(c.expires_at).getTime() < Date.now();
                  const statusText = c.applied_at
                    ? t('referrals_page.credits.applied_prefix', { when: relativeDate(c.applied_at) })
                    : expired ? t('referrals_page.credits.expired')
                    : t('referrals_page.credits.pending_expires', {
                        date: new Date(c.expires_at).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' }),
                      });
                  const sourceLabel = sourceDisplay(c.source, t);
                  return (
                    <li key={c.id} className="py-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-ink">
                          {t('referrals_page.credits.row_summary', { amount: formatAud(c.amount_cents), source: sourceLabel })}
                        </div>
                        <div className="text-2xs text-ink-soft">
                          {t('referrals_page.credits.earned_prefix', { when: relativeDate(c.issued_at) })}
                        </div>
                      </div>
                      <div className={[
                        'text-2xs',
                        c.applied_at ? 'text-forest' : expired ? 'text-ink-soft' : 'text-amber-ink',
                      ].join(' ')}>
                        {statusText}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className="text-sm text-ink-muted text-center pt-4 border-t border-rule">
              {t('referrals_page.credits.empty')}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'warning' }) {
  const color =
    tone === 'success' ? 'text-forest-ink' :
    tone === 'warning' ? 'text-amber-ink' :
    'text-ink';
  return (
    <div>
      <div className={['font-display text-3xl tracking-tightest', color].join(' ')}>{value}</div>
      <div className="text-2xs uppercase tracking-widest text-ink-muted mt-0.5">{label}</div>
    </div>
  );
}

function ConversionBadge({ status }: { status: string }) {
  const { t } = useTranslation('settings');
  if (status === 'converted') return <Badge variant="success">{t('referrals_page.history.status_converted')}</Badge>;
  if (status === 'pending') return <Badge variant="warning">{t('referrals_page.history.status_pending')}</Badge>;
  return <Badge variant="neutral">{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

function sourceDisplay(source: string, t: (k: string) => string): string {
  switch (source) {
    case 'referral_bonus': return t('referrals_page.credits.source_referral_bonus');
    case 'referral_welcome': return t('referrals_page.credits.source_referral_welcome');
    case 'manual_adjustment': return t('referrals_page.credits.source_manual_adjustment');
    default: return source;
  }
}

export default function Page() {
  return <AuthGuard><ReferralsInner /></AuthGuard>;
}
