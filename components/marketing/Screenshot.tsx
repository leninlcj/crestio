import { useState } from 'react';

type Props = {
  src: string;
  alt: string;
  caption: string;
};

/**
 * Product screenshot with graceful placeholder fallback. When the image file
 * at `src` exists in /public, it renders. When it 404s, we render a subtle
 * placeholder card with the caption so the layout stays intact.
 */
export default function Screenshot({ src, alt, caption }: Props) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="rounded-lg border border-rule bg-surface shadow-card overflow-hidden">
      {failed ? (
        <div className="aspect-[16/10] bg-ruleSoft flex items-center justify-center px-6">
          <div className="text-center">
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-2">Screenshot</div>
            <div className="text-sm text-ink-muted">{caption}</div>
          </div>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="block w-full h-auto"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
