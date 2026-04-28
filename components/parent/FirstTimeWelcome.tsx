import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Props = {
  parentId: string | null;
  parentName: string | null;
  tutorName: string | null;
  practiceName: string | null;
  tutorAbout?: string | null;
  shouldShow: boolean;
};

const STEPS = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'overview', title: 'Here\'s what you can see' },
  { id: 'privacy', title: 'Your privacy' },
];

export default function FirstTimeWelcome({ parentId, parentName, tutorName, practiceName, tutorAbout, shouldShow }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setOpen(!!shouldShow);
  }, [shouldShow]);

  async function close() {
    setOpen(false);
    if (parentId) {
      await supabase
        .from('parents')
        .update({ first_login_seen_at: new Date().toISOString() })
        .eq('id', parentId);
    }
  }

  if (!open) return null;
  const tutorFirst = (tutorName ?? 'Your tutor').split(' ')[0];
  const initials = (tutorName ?? '?').split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      className="fixed inset-0 z-50 grid place-items-center bg-ink/50 animate-fade-in p-4"
    >
      <div className="bg-surface rounded-lg shadow-lift border border-rule w-full max-w-md animate-slide-up">
        <div className="px-6 py-7">
          {step === 0 && (
            <Welcome name={parentName} tutorFirst={tutorFirst} practice={practiceName} initials={initials} about={tutorAbout} />
          )}
          {step === 1 && <Overview tutorFirst={tutorFirst} />}
          {step === 2 && <Privacy />}
        </div>
        <div className="border-t border-rule px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={['w-1.5 h-1.5 rounded-full transition-colors', i === step ? 'bg-forest' : 'bg-rule'].join(' ')}
                aria-hidden
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)} className="text-2xs text-ink-soft hover:text-ink">
                Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={() => setStep(step + 1)} className="btn-primary text-xs h-8 min-h-[32px] px-4">
                Continue →
              </button>
            ) : (
              <button type="button" onClick={close} className="btn-primary text-xs h-8 min-h-[32px] px-4">
                Got it
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Welcome({ name, tutorFirst, practice, initials, about }: { name: string | null; tutorFirst: string; practice: string | null; initials: string; about?: string | null }) {
  return (
    <>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-12 h-12 rounded-full bg-forest text-cream grid place-items-center font-display text-lg tracking-tightest" aria-hidden>
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-2xs uppercase tracking-widest text-ink-soft">Tutor</div>
          <div className="font-display text-base tracking-tightest text-ink truncate">{tutorFirst}{practice ? ` · ${practice}` : ''}</div>
        </div>
      </div>
      <h2 id="welcome-title" className="font-display text-xl tracking-tighter text-ink mb-3 leading-tight">
        Welcome{name ? `, ${name.split(' ')[0]}` : ''}.
      </h2>
      <p className="text-sm text-ink-muted leading-relaxed">
        {tutorFirst} uses Crestio to keep you in the loop on what you're paying for. Sessions, polished notes, invoices — all in one place.
      </p>
      {about && (
        <div className="mt-4 pt-4 border-t border-rule">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-2">A note from {tutorFirst}</div>
          <p className="text-sm text-ink-muted leading-relaxed italic">{about}</p>
        </div>
      )}
    </>
  );
}

function Overview({ tutorFirst }: { tutorFirst: string }) {
  return (
    <>
      <h2 id="welcome-title" className="font-display text-xl tracking-tighter text-ink mb-1 leading-tight">
        Here's what you can see.
      </h2>
      <p className="text-2xs text-ink-soft mb-5">No surprises — same things {tutorFirst} sees from their side, just for your child.</p>
      <ul className="space-y-3">
        <Item icon={<IconCal />} title="Sessions" body={`A history of every lesson with ${tutorFirst}'s polished notes.`} />
        <Item icon={<IconDollar />} title="Invoices" body="Pay by card. No bank transfers. Save your card to auto-pay later." />
        <Item icon={<IconChat />} title="Messages" body={`A direct chat with ${tutorFirst} for anything between sessions.`} />
      </ul>
    </>
  );
}

function Privacy() {
  return (
    <>
      <h2 id="welcome-title" className="font-display text-xl tracking-tighter text-ink mb-1 leading-tight">
        Your privacy.
      </h2>
      <p className="text-2xs text-ink-soft mb-5">Three things that are true.</p>
      <ul className="space-y-3 text-sm text-ink-muted leading-relaxed">
        <li className="flex items-start gap-2.5">
          <span className="text-forest mt-1" aria-hidden><Tick /></span>
          <span>Your data lives with your tutor's practice. We never share it with anyone else.</span>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="text-forest mt-1" aria-hidden><Tick /></span>
          <span>We don't sell anything. There are no ads, no marketing partners.</span>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="text-forest mt-1" aria-hidden><Tick /></span>
          <span>You can export everything or delete your account from Settings, anytime.</span>
        </li>
      </ul>
    </>
  );
}

function Item({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="text-forest mt-0.5 shrink-0" aria-hidden>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink">{title}</div>
        <div className="text-2xs text-ink-muted leading-relaxed">{body}</div>
      </div>
    </li>
  );
}

function Tick() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function IconCal() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>;
}
function IconDollar() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/></svg>;
}
function IconChat() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.3 7.3L4 21l1.7-5.7A8 8 0 1 1 21 12z"/></svg>;
}
