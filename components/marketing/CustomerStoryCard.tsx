import Link from 'next/link';
import type { CustomerStory } from '../../content/customer-stories';

type Props = { story: CustomerStory };

export default function CustomerStoryCard({ story }: Props) {
  return (
    <Link
      href={`/customers/${story.slug}`}
      className="block rounded-md border border-rule bg-surface p-5 md:p-6 hover:bg-ruleSoft/40 transition-colors group"
    >
      <div className="flex items-center gap-3 mb-4">
        <Avatar name={story.name} />
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink truncate">{story.name}</div>
          <div className="text-2xs text-ink-soft truncate">{story.context}</div>
        </div>
      </div>
      <div className="font-display text-base md:text-lg tracking-tightest text-ink leading-snug mb-3 text-balance">
        {story.result_one_line}.
      </div>
      <div className="flex items-center gap-3 text-2xs text-ink-soft uppercase tracking-widest">
        {story.stats.slice(0, 2).map((s, i) => (
          <span key={i} className="num tabular">{s.value} {s.label.toLowerCase()}</span>
        ))}
      </div>
      <div className="mt-4 text-2xs text-forest font-medium uppercase tracking-widest group-hover:underline">
        Read story →
      </div>
    </Link>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-forest-soft text-forest-ink grid place-items-center font-display text-sm tracking-tightest shrink-0">
      {initials}
    </div>
  );
}
