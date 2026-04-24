import { useEffect } from 'react';

type Capability = {
  title: string;
  example: string;
  flags?: string[];
};

type Section = { heading: string; items: Capability[] };

const SECTIONS: (isOwner: boolean) => Section[] = (isOwner) => {
  const write: Capability[] = [
    { title: 'Log a session', example: '"Log today’s session with Aarav, 1 hour, chemistry."' },
    { title: 'Polish session notes for the parent portal', example: '"Polish my last session notes for Mia."' },
    { title: 'Add a new student (and send a parent invitation)', example: '"Add Sarah Kim, Year 10, maths, $90/hr. Parent: sarah.mum@email.com."' },
    { title: "Update a student's details", example: '"Change Aarav’s subject from chemistry to physics."' },
    { title: 'Archive a student', example: '"Archive Jake — he’s not continuing this term."' },
    { title: 'Create an invoice', example: '"Invoice the Chen family for April’s sessions."', flags: ['Typed confirmation'] },
    { title: 'Mark an invoice as paid', example: '"Mark INV-0014 paid."', flags: ['Typed confirmation'] },
    { title: 'Send a parent update via the portal', example: '"Draft a quick update to Aarav’s mum about this week."', flags: ['Typed confirmation', 'No email — portal only'] },
  ];

  if (isOwner) {
    write.push({
      title: 'Assign a student to a tutor',
      example: '"Assign Sarah to Mai."',
      flags: ['Owner only'],
    });
  }

  return [
    {
      heading: 'Answering questions',
      items: [
        { title: "What sessions you've got coming up", example: '"What’s on tomorrow?"' },
        { title: 'Info on a student (history, upcoming, balance, parents)', example: '"Tell me about Aarav."' },
        { title: 'Unpaid invoices', example: '"Who owes me money?"' },
        { title: 'Earnings this week/month', example: '"How much have I earned this week?"' },
        { title: "Finding a parent's contact details", example: '"What’s Sarah’s mum’s email?"' },
      ],
    },
    {
      heading: 'Getting work done',
      items: write,
    },
  ];
};

export function AssistantCapabilityModal({
  open,
  onClose,
  isOwner,
}: {
  open: boolean;
  onClose: () => void;
  isOwner: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const sections = SECTIONS(isOwner);

  return (
    <div
      className="fixed inset-0 z-[60] bg-ink/40 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-label="What can the assistant do?"
      aria-modal="true"
    >
      <div
        className="relative bg-cream border border-rule rounded-lg shadow-lift max-w-lg w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-cream border-b border-rule px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-soft">Crestio assistant</div>
            <div className="font-display text-xl tracking-tightest text-ink">What can I do?</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost text-xs"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <div className="px-5 py-5 space-y-6">
          {sections.map((section) => (
            <section key={section.heading}>
              <h3 className="text-2xs uppercase tracking-widest text-ink-soft mb-3">
                {section.heading}
              </h3>
              <ul className="space-y-3">
                {section.items.map((it) => (
                  <li key={it.title}>
                    <div className="text-sm text-ink flex items-center flex-wrap gap-2">
                      <span>{it.title}</span>
                      {it.flags?.map((f) => (
                        <span
                          key={f}
                          className="inline-block text-2xs uppercase tracking-widest px-1.5 py-0.5 rounded border border-rule text-ink-muted"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                    <div className="text-xs text-ink-muted mt-1 italic">{it.example}</div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <div className="text-2xs text-ink-soft border-t border-rule pt-4">
            Things I can't do yet: recurring sessions, emails to parents, rescheduling, lesson plans (use the Lesson plans page), subscription changes, charts.
          </div>
        </div>
      </div>
    </div>
  );
}

export default AssistantCapabilityModal;
