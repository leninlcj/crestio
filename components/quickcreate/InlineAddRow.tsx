import { useRouter } from 'next/router';

// InlineAddRow — drop-in row/tile that mirrors the surrounding list styling
// and lets users add an entity in-place.  Variant 'row' for tabular lists,
// variant 'tile' for card grids.
//
// Usage:
//   <InlineAddRow type="student" label="Add student" />
//   <InlineAddRow type="session" label="Schedule session" variant="row" />
//
// Click → dispatches crestio:open-quick-create with the chosen type, OR
// triggers the inline composer for sessions, OR navigates to a route when
// `href` is provided.

type Props = {
  type:
    | 'student' | 'session' | 'household' | 'parent' | 'invoice'
    | 'lesson_plan' | 'file' | 'template' | 'message_thread';
  label: string;
  variant?: 'row' | 'tile';
  href?: string;
};

export function InlineAddRow({ type, label, variant = 'row', href }: Props) {
  const router = useRouter();

  function trigger() {
    if (href) { router.push(href); return; }
    if (type === 'session') {
      window.dispatchEvent(new CustomEvent('crestio:open-inline-composer'));
    } else {
      window.dispatchEvent(new CustomEvent('crestio:open-quick-create', { detail: { type } }));
    }
  }

  if (variant === 'tile') {
    return (
      <button
        type="button"
        onClick={trigger}
        className="w-full h-full min-h-[210px] border border-dashed border-rule rounded-md bg-surface hover:bg-forest/5 hover:border-forest transition-colors duration-100 flex flex-col items-center justify-center gap-2 text-ink-muted hover:text-forest"
        aria-label={label}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span className="text-sm">{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={trigger}
      className="w-full flex items-center gap-3 px-4 py-2.5 border border-dashed border-rule rounded-md bg-surface hover:bg-forest/5 hover:border-forest transition-colors duration-100 text-ink-muted hover:text-forest"
      aria-label={label}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span className="text-sm">{label}</span>
    </button>
  );
}

export default InlineAddRow;
