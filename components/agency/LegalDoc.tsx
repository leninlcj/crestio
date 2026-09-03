import type { LegalDoc } from '../../lib/agencyLegal';

// Renders one of the agency's legal documents. Used on the public pages and
// inside the in-app acceptance step.
export function LegalDocBody({ doc, compact = false }: { doc: LegalDoc; compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-5 text-sm' : 'space-y-8 text-sm md:text-base'}>
      <p className="text-ink-muted leading-relaxed">{doc.intro}</p>
      {doc.sections.map((s) => (
        <section key={s.id} id={s.id}>
          <h2 className={`${compact ? 'text-base' : 'font-display text-xl md:text-2xl tracking-tighter'} text-ink mb-2`}>{s.heading}</h2>
          {s.paragraphs?.map((p, i) => <p key={i} className="text-ink-muted leading-relaxed mb-2">{p}</p>)}
          {s.bullets && (
            <ul className="space-y-1.5">
              {s.bullets.map((b, i) => (
                <li key={i} className="flex gap-3 text-ink-muted leading-relaxed">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-forest shrink-0" aria-hidden />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <p className="text-2xs text-ink-soft">Version {doc.version}.</p>
    </div>
  );
}
