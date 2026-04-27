import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import SettingsTabs from '../../../components/SettingsTabs';

// API & integrations — placeholder card for now. Real wiring lands when we
// open the public API + a marketplace of native integrations.
function IntegrationsInner() {
  return (
    <Layout pageTitle="API & integrations" title="API & integrations" subtitle="Settings">
      <SettingsTabs />
      <div className="max-w-2xl space-y-4">
        <div className="card p-5 md:p-6">
          <div className="text-2xs uppercase tracking-widest text-ink-muted font-medium mb-2">Coming soon</div>
          <h2 className="text-[16px] font-display font-semibold tracking-tightest mb-1">A clean public API for Crestio</h2>
          <p className="text-sm text-ink-muted leading-relaxed">
            Connect Crestio to Zapier, Google Calendar, Apple Calendar, Slack, and your own scripts.
            We'll send you a one-time invite when this lands.
          </p>
        </div>
        <div className="card p-5 md:p-6">
          <div className="text-2xs uppercase tracking-widest text-ink-muted font-medium mb-2">Calendar export (live now)</div>
          <p className="text-sm text-ink-muted leading-relaxed">
            Subscribe to your sessions in any calendar app via the secure ICS feed.{' '}
            <a className="text-forest underline" href="/app/settings/preferences">
              Open preferences →
            </a>
          </p>
        </div>
      </div>
    </Layout>
  );
}

export default function Page() {
  return <AuthGuard><IntegrationsInner /></AuthGuard>;
}
