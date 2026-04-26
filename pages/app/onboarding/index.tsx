import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import { supabase } from '../../../lib/supabase';
import { dollarsToCents } from '../../../lib/utils';

function OnboardingInner() {
  const { t } = useTranslation('onboarding');
  const router = useRouter();
  const [ownerName, setOwnerName] = useState('');
  const [businessName, setBusinessName] = useState('');
  // Suggested business name from the auto-generated org name (e.g. "alex
  // Tutoring"). Shown as a placeholder; the user must confirm or edit before
  // it's saved (P1-2.2).
  const [businessSuggestion, setBusinessSuggestion] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultRate, setDefaultRate] = useState('80');
  const [currency, setCurrency] = useState('AUD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: p } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      if (p?.onboarded) {
        router.replace('/app');
        return;
      }
      if (p) {
        setOwnerName(p.owner_name ?? '');
        setBusinessName(p.business_name ?? '');
        setPhone(p.phone ?? '');
        if (p.default_rate_cents) setDefaultRate((p.default_rate_cents / 100).toString());
        if (p.currency) setCurrency(p.currency);
      }
      // The signup trigger seeds organizations.name = "<email_prefix> Tutoring".
      // Use it as the placeholder so users can take it as-is or edit it.
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('owner_user_id', session.user.id)
        .maybeSingle();
      if (org?.name) setBusinessSuggestion(org.name);
    })();
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedBusiness = businessName.trim();
    if (!trimmedBusiness) {
      setError(t('setup.business_required'));
      return;
    }

    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError(t('setup.session_expired'));
      setLoading(false);
      return;
    }

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({
        owner_name: ownerName || null,
        business_name: trimmedBusiness,
        phone: phone || null,
        default_rate_cents: dollarsToCents(defaultRate),
        currency,
        onboarded: true,
      })
      .eq('id', session.user.id);

    if (profileErr) {
      setLoading(false);
      setError(profileErr.message);
      return;
    }

    // Replace the auto-generated organization name with what the user just
    // confirmed. This is the name parents see in invitation emails, file
    // watermarks, etc — must match what the tutor wants from day 1.
    const { error: orgErr } = await supabase
      .from('organizations')
      .update({ name: trimmedBusiness })
      .eq('owner_user_id', session.user.id);

    setLoading(false);
    if (orgErr) {
      setError(orgErr.message);
      return;
    }
    router.push('/app');
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <div className="px-6 md:px-12 py-6">
        <Link href="/app" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
      </div>

      <div className="flex-1 flex items-start justify-center px-6 pb-16 pt-8">
        <div className="w-full max-w-lg">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('setup.kicker')}</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tightest mb-3">
            {t('setup.heading')}
          </h1>
          <p className="text-sm text-ink-muted mb-10">
            {t('setup.intro')}
          </p>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="label">{t('setup.name_label')}</label>
              <input
                type="text"
                required
                autoFocus
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="input"
                placeholder={t('setup.name_placeholder')}
              />
            </div>
            <div>
              <label htmlFor="onboarding-business" className="label">{t('setup.business_label')}</label>
              <input
                id="onboarding-business"
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="input"
                placeholder={businessSuggestion || t('setup.business_placeholder')}
                autoComplete="organization"
              />
              <div className="text-2xs text-ink-soft mt-1.5">
                {t('setup.business_hint')}
              </div>
              {businessSuggestion && !businessName && (
                <button
                  type="button"
                  onClick={() => setBusinessName(businessSuggestion)}
                  className="mt-2 text-2xs text-forest hover:text-forest-ink underline underline-offset-2"
                >
                  {t('setup.business_use_suggestion', { name: businessSuggestion })}
                </button>
              )}
            </div>
            <div>
              <label className="label">{t('setup.phone_label')}</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">{t('setup.default_rate_label')}</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={defaultRate}
                  onChange={(e) => setDefaultRate(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="label">{t('setup.currency_label')}</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="input"
                >
                  <option value="AUD">AUD</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="EUR">EUR</option>
                  <option value="NZD">NZD</option>
                  <option value="CAD">CAD</option>
                </select>
              </div>
            </div>

            {error && <div className="text-sm text-claret">{error}</div>}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
              {loading ? t('setup.saving') : t('setup.continue')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function Onboarding() {
  return (
    <AuthGuard requireOnboarded={false}>
      <OnboardingInner />
    </AuthGuard>
  );
}
