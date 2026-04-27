import Link from 'next/link';
import type { FounderNote } from '../../lib/founderNotes';

type Props = { latest: FounderNote | null };

export default function FounderHomepageEmbed({ latest }: Props) {
  if (!latest) return null;
  const paragraphs = latest.body.split(/\n\n+/).slice(0, 2);

  return (
    <section className="px-6 md:px-12 py-16 md:py-20 max-w-5xl mx-auto">
      <div className="grid md:grid-cols-[200px_1fr] gap-6 md:gap-12 items-start">
        <div className="flex md:flex-col items-center md:items-start gap-4 md:gap-3">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-forest-soft text-forest-ink grid place-items-center font-display text-2xl md:text-3xl tracking-tightest shrink-0" aria-hidden>
            L
          </div>
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-0.5">From the founder</div>
            <div className="font-display text-base tracking-tightest text-ink">Lenin</div>
          </div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-2 num tabular">{latest.date}</div>
          <h2 className="font-display text-2xl md:text-3xl tracking-tighter text-ink mb-4 leading-tight text-balance">
            {latest.title}
          </h2>
          <div className="text-base text-ink-muted leading-relaxed space-y-4 max-w-prose">
            {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <Link href="/founder" className="inline-block mt-5 text-sm text-forest hover:underline">
            Read all updates →
          </Link>
        </div>
      </div>
    </section>
  );
}
