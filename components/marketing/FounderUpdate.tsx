import Link from 'next/link';
import type { FounderNote } from '../../lib/founderNotes';

type Props = {
  note: FounderNote;
  variant?: 'card' | 'page' | 'preview';
};

export default function FounderUpdate({ note, variant = 'card' }: Props) {
  const paragraphs = note.body.split(/\n\n+/);
  const isPreview = variant === 'preview';
  const showParagraphs = isPreview ? paragraphs.slice(0, 2) : paragraphs;

  return (
    <article className={variant === 'page' ? 'mb-14 md:mb-16 last:mb-0' : ''}>
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <div className="text-2xs uppercase tracking-widest text-ink-soft num tabular">{note.date}</div>
        {variant === 'preview' && (
          <Link href="/founder" className="text-2xs uppercase tracking-widest text-forest hover:underline">
            Read all updates →
          </Link>
        )}
      </div>
      <h2 className={[
        'font-display tracking-tighter text-ink m-0 mb-4 leading-tight text-balance',
        variant === 'page' ? 'text-2xl md:text-3xl' : 'text-xl md:text-2xl',
      ].join(' ')}>
        {note.title}
      </h2>
      <div className="text-base text-ink-muted leading-relaxed space-y-4 max-w-prose">
        {showParagraphs.map((p, i) => <p key={i}>{p}</p>)}
        {isPreview && paragraphs.length > showParagraphs.length && (
          <Link href="/founder" className="inline-block text-sm text-forest hover:underline">
            Read the rest →
          </Link>
        )}
      </div>
      {variant === 'page' && (
        <div className="mt-5 text-2xs uppercase tracking-widest text-ink-soft">
          — Lenin, founder
        </div>
      )}
    </article>
  );
}
