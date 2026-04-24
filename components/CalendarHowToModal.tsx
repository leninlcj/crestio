import { useEffect, useState } from 'react';
import { Modal } from './design/Modal';

// Subscribe-to-your-calendar instructions. Six sections cover every
// mainstream calendar app. On desktop (>=768px) the sections are a
// horizontal tab strip. On mobile (<768px) they collapse to an accordion
// with only one section open at a time.

const SECTIONS = [
  {
    key: 'google-desktop',
    label: 'Google Calendar on a computer',
    body: [
      'Open calendar.google.com.',
      "In the left sidebar, find 'Other calendars' and click the plus icon next to it.",
      "Choose 'From URL'.",
      'Paste your Crestio subscription URL.',
      "Click 'Add calendar'.",
      'Your Crestio sessions will appear on your Google Calendar within a few minutes.',
    ],
  },
  {
    key: 'google-mobile',
    label: 'Google Calendar on iPhone or Android',
    body: [
      "Google Calendar's mobile apps can't add a URL-based calendar directly. Instead:",
      'Open calendar.google.com on any computer.',
      "Follow the steps in 'Google Calendar on a computer' above.",
      'Once the calendar is added on desktop, it syncs automatically to Google Calendar on your phone — no extra setup needed.',
    ],
  },
  {
    key: 'apple-mac',
    label: 'Apple Calendar on Mac',
    body: [
      'Open the Calendar app on your Mac.',
      'In the menu bar, choose File → New Calendar Subscription.',
      'Paste your Crestio URL and click Subscribe.',
      "Set 'Auto-refresh' to Every hour, then click OK.",
    ],
  },
  {
    key: 'apple-ios',
    label: 'Apple Calendar on iPhone or iPad',
    body: [
      'Open the Settings app (not the Calendar app).',
      'Scroll down and tap Calendar.',
      'Tap Accounts.',
      'Tap Add Account.',
      'Choose Other.',
      'Tap Add Subscribed Calendar.',
      'Paste your Crestio URL, tap Next, then Save.',
      'Your sessions will appear in the Calendar app within a minute.',
    ],
  },
  {
    key: 'outlook',
    label: 'Microsoft Outlook (Windows or Mac)',
    body: [
      'In Outlook, switch to the Calendar view.',
      'Click Home → Add Calendar.',
      "Choose 'From Internet' (Windows) or 'Subscribe' (Mac).",
      'Paste your Crestio URL and click OK.',
      "Name the calendar 'Crestio' and confirm.",
    ],
  },
  {
    key: 'other',
    label: 'Other calendar apps',
    body: [
      "Any calendar app that supports iCal subscriptions (sometimes called 'webcal' or 'ICS feeds') can use your Crestio URL.",
      "Look in your app's settings for 'Subscribe to calendar', 'Add calendar from URL', or 'Import calendar subscription'.",
      "If you can't find the option, contact support and we'll help.",
    ],
  },
];

type Props = { open: boolean; onClose: () => void };

export function CalendarHowToModal({ open, onClose }: Props) {
  const [activeTab, setActiveTab] = useState(SECTIONS[0].key);
  const [isMobile, setIsMobile] = useState(false);
  const [openAccordion, setOpenAccordion] = useState(SECTIONS[0].key);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  const active = SECTIONS.find((s) => s.key === activeTab) ?? SECTIONS[0];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Subscribe to your Crestio calendar"
      subtitle="Pick your calendar app for step-by-step instructions."
      size="lg"
    >
      {isMobile ? (
        <div className="divide-y divide-rule">
          {SECTIONS.map((s) => {
            const isOpen = openAccordion === s.key;
            return (
              <div key={s.key}>
                <button
                  type="button"
                  onClick={() => setOpenAccordion(isOpen ? '' : s.key)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between py-3 text-left"
                >
                  <span className="text-sm text-ink">{s.label}</span>
                  <span className="text-ink-soft">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && (
                  <ol className="pb-4 text-sm text-ink-muted space-y-1.5 list-decimal pl-5">
                    {s.body.map((line, i) => <li key={i}>{line}</li>)}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          <div className="border-b border-rule -mx-5 px-5 overflow-x-auto">
            <nav role="tablist" aria-label="Calendar instructions" className="flex gap-1 min-w-max">
              {SECTIONS.map((s) => {
                const isActive = s.key === activeTab;
                return (
                  <button
                    key={s.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(s.key)}
                    className={[
                      'inline-flex items-center px-3 py-2.5 text-sm -mb-px border-b-2 transition-colors',
                      isActive
                        ? 'border-forest text-ink font-medium'
                        : 'border-transparent text-ink-muted hover:text-ink',
                    ].join(' ')}
                  >
                    {s.label}
                  </button>
                );
              })}
            </nav>
          </div>
          <ol className="mt-5 text-sm text-ink-muted space-y-2 list-decimal pl-5">
            {active.body.map((line, i) => <li key={i}>{line}</li>)}
          </ol>
        </div>
      )}
    </Modal>
  );
}

export default CalendarHowToModal;
