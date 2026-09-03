import Link from 'next/link';
import { useRouter } from 'next/router';
import type { FounderNote } from '../../lib/founderNotes';
import { formatDate } from '../../lib/currency';

type Props = {
  note: FounderNote;
  variant?: 'card' | 'page' | 'preview';
};

// Linkify bare email addresses in note prose as forest mailto links,
// matching the page-header link styling (text-forest underline).
const EMAIL_SPLIT = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const EMAIL_ONLY = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function renderProse(text: string) {
  return text.split(EMAIL_SPLIT).map((part, i) =>
    EMAIL_ONLY.test(part) ? (
      <a key={i} href={`mailto:${part}`} className="text-forest underline underline-offset-2">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

export default function FounderUpdate({ note, variant = 'card' }: Props) {
  const router = useRouter();
  const allParagraphs = note.body.split(/\n\n+/);
  const isPreview = variant === 'preview';

  // Detect trailing sign-off paragraph (starts with "—"). Render it in small
  // caps below the body so each note's sign-off is its own line — and so
  // multi-line sign-offs (e.g. "— Lenin\nSydney, May 2026") render with the
  // line break preserved.
  let signoff: string | null = null;
  let bodyParagraphs = allParagraphs;
  const last = allParagraphs[allParagraphs.length - 1];
  if (last && /^—\s/.test(last.trimStart())) {
    signoff = last;
    bodyParagraphs = allParagraphs.slice(0, -1);
  }

  const showParagraphs = isPreview ? bodyParagraphs.slice(0, 2) : bodyParagraphs;
  const hasMore = isPreview && bodyParagraphs.length > showParagraphs.length;

  return (
    <article id={note.slug} className={variant === 'page' ? 'mb-14 md:mb-16 last:mb-0 scroll-mt-20' : ''}>
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <div className="text-2xs uppercase tracking-widest text-ink-muted num tabular">{formatDate(note.date, router.locale ?? 'en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</div>
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
        {showParagraphs.map((p, i) => <p key={i}>{renderProse(p)}</p>)}
        {hasMore && (
          <Link href="/founder" className="inline-block text-sm text-forest hover:underline">
            Read the rest →
          </Link>
        )}
      </div>
      {signoff && !isPreview && (
        <div
          className="mt-6 text-2xs uppercase tracking-widest text-ink-muted whitespace-pre-line"
        >
          {signoff}
        </div>
      )}
    </article>
  );
}
