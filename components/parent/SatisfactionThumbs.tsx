import { useState } from 'react';
import { supabase } from '../../lib/supabase';

type Props = {
  sessionId: string;
  tutorName: string;
  // If a rating already exists, hide the thumbs.
  existingRating?: -1 | 1 | null;
};

export default function SatisfactionThumbs({ sessionId, tutorName, existingRating = null }: Props) {
  const [rated, setRated] = useState<-1 | 1 | null>(existingRating);
  const [busy, setBusy] = useState(false);

  if (rated !== null) {
    return (
      <div className="text-2xs text-ink-soft border-t border-rule pt-4 mt-4 flex items-center gap-2">
        <span aria-hidden className={rated === 1 ? 'text-forest' : 'text-ink-muted'}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
        Thanks for letting {firstName(tutorName)} know.
      </div>
    );
  }

  async function rate(rating: -1 | 1) {
    if (busy) return;
    setBusy(true);
    setRated(rating); // optimistic
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/parent/satisfaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ session_id: sessionId, rating }),
      });
      if (!res.ok) setRated(null);
    } catch {
      setRated(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-rule pt-4 mt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-2xs text-ink-muted">Was this helpful?</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => rate(1)}
            aria-label="Helpful"
            className="w-8 h-8 grid place-items-center rounded-full border border-rule text-ink-muted hover:text-forest hover:border-forest transition-colors disabled:opacity-50"
          >
            <ThumbUp />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => rate(-1)}
            aria-label="Not helpful"
            className="w-8 h-8 grid place-items-center rounded-full border border-rule text-ink-muted hover:text-claret hover:border-claret transition-colors disabled:opacity-50"
          >
            <ThumbDown />
          </button>
        </div>
      </div>
    </div>
  );
}

function firstName(name: string): string {
  return (name ?? 'your tutor').split(' ')[0];
}

function ThumbUp() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3z"/><path d="M7 11l4-7a2 2 0 0 1 4 1v4h4a2 2 0 0 1 2 2.34l-1.5 6A2 2 0 0 1 17.5 19H7v-8z"/></svg>;
}
function ThumbDown() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3z"/><path d="M17 13l-4 7a2 2 0 0 1-4-1v-4H5a2 2 0 0 1-2-2.34L4.5 6.66A2 2 0 0 1 6.5 5H17v8z"/></svg>;
}
