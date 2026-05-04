import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import SettingsTabs from '../../../components/SettingsTabs';
import { supabase } from '../../../lib/supabase';

type Status = {
  summary: string | null;
  updated_at: string | null;
  sample_count: number;
};

const FIRST_THRESHOLD = 3;

function VoiceInner() {
  const { t } = useTranslation('settings');
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(false);

  async function loadStatus() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/voice-profile/status', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = (await res.json()) as Status;
        setStatus(json);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function reset() {
    if (!window.confirm(t('voice_page.reset_confirm'))) return;
    setResetting(true);
    setResetMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setResetMessage(t('common.not_signed_in'));
        return;
      }
      const res = await fetch('/api/voice-profile/reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setResetMessage(t('voice_page.reset_failed'));
        return;
      }
      setResetMessage(t('voice_page.reset_done'));
      await loadStatus();
    } finally {
      setResetting(false);
    }
  }

  const sampleCount = status?.sample_count ?? 0;
  const updatedLabel = status?.updated_at
    ? new Date(status.updated_at).toLocaleDateString(undefined, {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : t('voice_page.stat_updated_never');

  return (
    <Layout
      pageTitle={`${t('tabs.voice')} · ${t('page_title')}`}
      subtitle={t('tabs.voice')}
      title={t('page_title')}
    >
      <SettingsTabs />
      <div className="max-w-2xl space-y-6">
        <div className="card p-8 space-y-4">
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{t('voice_page.eyebrow')}</div>
            <h2 className="font-display text-xl tracking-tightest">{t('voice_page.heading')}</h2>
            <p className="text-sm text-ink-muted mt-2">{t('voice_page.intro')}</p>
          </div>
          {loading ? (
            <div className="text-sm text-ink-muted">{t('common.loading')}</div>
          ) : (
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1">
                  {t('voice_page.stat_samples')}
                </div>
                <div className="font-display text-2xl tracking-tightest">{sampleCount}</div>
              </div>
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1">
                  {t('voice_page.stat_updated')}
                </div>
                <div className="text-sm">{updatedLabel}</div>
              </div>
            </div>
          )}
        </div>

        <div className="card p-8 space-y-4">
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">
              {t('voice_page.current_eyebrow')}
            </div>
            <h2 className="font-display text-xl tracking-tightest">
              {t('voice_page.current_heading')}
            </h2>
          </div>
          {loading ? (
            <div className="text-sm text-ink-muted">{t('common.loading')}</div>
          ) : status?.summary ? (
            <blockquote className="border-l-4 border-forest pl-4 py-2 text-sm text-ink leading-relaxed whitespace-pre-wrap">
              {status.summary}
            </blockquote>
          ) : (
            <div className="rounded-md border border-rule p-5 bg-surface text-sm">
              <div className="font-medium text-ink mb-1">{t('voice_page.no_profile_title')}</div>
              <p className="text-ink-muted">{t('voice_page.no_profile_body')}</p>
            </div>
          )}
        </div>

        {!loading && status?.summary && (
          <div className="card p-8 space-y-3">
            <div>
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">
                {t('voice_page.reset_eyebrow')}
              </div>
              <h2 className="font-display text-xl tracking-tightest">
                {t('voice_page.reset_heading')}
              </h2>
              <p className="text-sm text-ink-muted mt-2">{t('voice_page.reset_body')}</p>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={reset} disabled={resetting} className="btn-secondary">
                {resetting ? t('voice_page.resetting') : t('voice_page.reset_button')}
              </button>
              {resetMessage && <span className="text-sm text-ink-muted">{resetMessage}</span>}
            </div>
          </div>
        )}

        <div className="card p-8 space-y-3">
          <button
            type="button"
            onClick={() => setHowOpen((v) => !v)}
            className="w-full text-left"
            aria-expanded={howOpen}
          >
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">
              {t('voice_page.how_eyebrow')}
            </div>
            <h2 className="font-display text-xl tracking-tightest flex items-center justify-between">
              <span>{t('voice_page.how_heading')}</span>
              <span aria-hidden="true" className="text-ink-soft">{howOpen ? '−' : '+'}</span>
            </h2>
          </button>
          {howOpen && (
            <ol className="list-decimal list-inside text-sm text-ink-muted space-y-2 pt-2">
              <li>{t('voice_page.how_step_1')}</li>
              <li>{t('voice_page.how_step_2')}</li>
              <li>
                {t('voice_page.how_step_3', {
                  defaultValue: 'After 3, 10, 20 and 50 samples, Crestio re-reads your edits and distils a short style guide.',
                })}
              </li>
              <li>{t('voice_page.how_step_4')}</li>
            </ol>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default function Page() {
  return <AuthGuard><VoiceInner /></AuthGuard>;
}

export { FIRST_THRESHOLD };
