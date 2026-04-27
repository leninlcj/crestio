import { useMemo } from 'react';
import { initials } from '../../lib/utils';

type Size = 16 | 20 | 24 | 28 | 32 | 40 | 48;

type Props = {
  name: string | null | undefined;
  /** Optional unique seed for hue. Defaults to name. */
  seed?: string;
  size?: Size;
  className?: string;
  /** Pre-rendered image URL (e.g. user-uploaded). When set, overrides initials. */
  src?: string | null;
  /** Subtle border ring on hover (used in clickable contexts). */
  ring?: boolean;
  title?: string;
};

// Deterministic colored avatar. Hue derived from name hash so the same
// student always gets the same chip. Saturation/lightness fixed for
// consistent feel; white text on top.
//
// Sizes are explicit (px) so the parent can control layout without
// relying on Tailwind's `h-N w-N` to be present.
export function Avatar({ name, seed, size = 28, className, src, ring, title }: Props) {
  const label = (name ?? '?').trim();
  const hue = useMemo(() => hashHue(seed ?? label), [seed, label]);
  const fontSize = Math.max(10, Math.round(size * 0.42));

  const style = src
    ? { width: size, height: size }
    : {
        width: size,
        height: size,
        background: `hsl(${hue} 60% 42%)`,
        fontSize,
        lineHeight: 1,
      } as const;

  const cls = [
    'inline-flex items-center justify-center rounded-full text-white font-medium select-none shrink-0',
    ring ? 'ring-0 hover:ring-2 hover:ring-forest/30 transition-shadow duration-100' : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  if (src) {
    return (
      <img
        src={src}
        alt={label}
        title={title ?? label}
        className={`${cls} object-cover bg-ruleSoft`}
        style={style}
        width={size}
        height={size}
      />
    );
  }

  return (
    <span
      className={cls}
      style={style}
      title={title ?? label}
      aria-label={label}
    >
      {initials(label)}
    </span>
  );
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

export default Avatar;
