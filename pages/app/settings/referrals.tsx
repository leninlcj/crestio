import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
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

function relativeDate(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const days = Math.floor((now - t) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return new Date(iso).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

function ReferralsInner() {
  const router = useRouter();
  const { membership } = useMembership();
  const isOwner = membership?.role === 'owner';

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
      window.prompt('Copy this:', value);
    }
  }

  if (loading || !me) {
    return (
      <Layout subtitle="Referrals" title="Settings">
        <SettingsTabs />
        <div className="card p-6 text-sm text-ink-muted">Loading…</div>
      </Layout>
    );
  }

  const messageTemplate =
    `Hey — I've been using Crestio to manage my tutoring. It's actually good. Here's 25% off your first month if you want to try: ${me.share_link}`;
  const atCap = me.referrals_remaining_this_year <= 0;

  return (
    <Layout subtitle="Referrals" title="Settings">
      <SettingsTabs />

      <div className="max-w-3xl space-y-6">
        {/* Top: share card */}
        <div className="card p-8 space-y-5">
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Referrals</div>
            <h2 className="font-display text-2xl md:text-3xl tracking-tightest text-ink mb-2">
              Share Crestio. Get 25% off each month you refer a friend.
            </h2>
            <p className="text-sm text-ink-muted leading-relaxed">
              When a friend signs up using your code and their trial converts, you both get 25% off your next month.
            </p>
          </div>

          <div>
            <label className="label">Your referral code</label>
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
                {copied === 'code' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div>
            <label className="label">Your share link</label>
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
                {copied === 'link' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-rule">
            <button
              type="button"
              onClick={() => copy('message', messageTemplate)}
              className="btn-ghost text-xs"
            >
              {copied === 'message' ? 'Message copied' : 'Copy message template'}
            </button>
            <a
              href={`mailto:?subject=${encodeURIComponent('Try Crestio')}&body=${encodeURIComponent(messageTemplate)}`}
              className="btn-ghost text-xs"
            >
              Share by email
            </a>
          </div>
        </div>

        {/* Middle: stats + history */}
        <div className="card p-8 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Your referrals</div>
              <h2 className="font-display text-xl tracking-tightest">Conversion history</h2>
            </div>
            <div className="text-2xs text-ink-soft">
              You've used <strong>{me.referrals_this_year}</strong> of <strong>{me.max_referrals_per_year}</strong> referrals this year.
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center py-2">
            <Stat label="Sent" value={me.stats.total_sent} />
            <Stat label="Converted" value={me.stats.converted} tone="success" />
            <Stat label="Pending" value={me.stats.pending} tone="warning" />
          </div>

          {atCap && (
            <div className="text-xs text-amber-ink bg-amber-soft/50 border border-amber/40 rounded p-3">
              You've hit this year's referral cap. New referrals still get their 25% discount, but you won't earn more credits until the cap resets in January.
            </div>
          )}

          {history?.conversions && history.conversions.length > 0 ? (
            <ul className="divide-y divide-ruleSoft">
              {history.conversions.map((c) => (
                <li key={c.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm text-ink">A tutor you referred</div>
                    <div className="text-2xs text-ink-soft">
                      Signed up {relativeDate(c.signed_up_at)}
                      {c.status === 'converted' && c.converted_at ? ` · converted ${relativeDate(c.converted_at)}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.credit_earned_cents != null && c.credit_earned_cents > 0 && (
                      <span className="text-xs text-forest-ink font-medium">
                        {formatAud(c.credit_earned_cents)} earned
                      </span>
                    )}
                    <ConversionBadge status={c.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-ink-muted text-center py-6">
              No referrals yet. Share your link above to get started.
            </div>
          )}
        </div>

        {/* Bottom: credits */}
        <div className="card p-8 space-y-5">
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Your credits</div>
            <h2 className="font-display text-xl tracking-tightest">Credit balance</h2>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="font-display text-4xl tracking-tightest text-ink">
              {formatAud(me.credits_available_cents)}
            </span>
            <span className="text-sm text-ink-muted">available</span>
          </div>
          <div className="text-xs text-ink-muted -mt-3">
            Applies automatically to your next invoice. Credits expire 90 days after issue.
          </div>

          {history?.credits && history.credits.length > 0 ? (
            <div className="pt-3 border-t border-rule">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">History</div>
              <ul className="divide-y divide-ruleSoft text-sm">
                {history.credits.map((c) => {
                  const expired = !c.applied_at && new Date(c.expires_at).getTime() < Date.now();
                  const statusText = c.applied_at
                    ? `Applied ${relativeDate(c.applied_at)}`
                    : expired ? 'Expired'
                    : `Pending · expires ${new Date(c.expires_at).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' })}`;
                  const sourceLabel = sourceDisplay(c.source);
                  return (
                    <li key={c.id} className="py-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-ink">{formatAud(c.amount_cents)} · {sourceLabel}</div>
                        <div className="text-2xs text-ink-soft">
                          Earned {relativeDate(c.issued_at)}
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
              No credits yet.
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
  if (status === 'converted') return <Badge variant="success">Converted</Badge>;
  if (status === 'pending') return <Badge variant="warning">Pending</Badge>;
  return <Badge variant="neutral">{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

function sourceDisplay(source: string): string {
  switch (source) {
    case 'referral_bonus': return 'Referral bonus';
    case 'referral_welcome': return 'Welcome credit';
    case 'manual_adjustment': return 'Manual adjustment';
    default: return source;
  }
}

export default function Page() {
  return <AuthGuard><ReferralsInner /></AuthGuard>;
}
