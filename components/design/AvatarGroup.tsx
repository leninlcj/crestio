import { Avatar } from './Avatar';

type Props = {
  names: string[];
  size?: 16 | 20 | 24 | 28 | 32;
  /** How many avatars to show before collapsing to "+N". */
  max?: number;
  className?: string;
};

// Overlapping avatar circles + "+N" pill when the list overflows. Used in
// "[N] tutors" / "[N] students" surface markers.
export function AvatarGroup({ names, size = 24, max = 3, className }: Props) {
  if (!names || names.length === 0) return null;
  const shown = names.slice(0, max);
  const overflow = names.length - shown.length;

  return (
    <div className={['flex items-center', className ?? ''].join(' ')}>
      {shown.map((n, i) => (
        <span
          key={`${n}-${i}`}
          className="rounded-full ring-2 ring-surface"
          style={{ marginLeft: i === 0 ? 0 : -Math.round(size * 0.32) }}
        >
          <Avatar name={n} size={size} />
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="rounded-full ring-2 ring-surface bg-ruleSoft text-ink-muted text-2xs font-medium grid place-items-center"
          style={{
            width: size, height: size,
            marginLeft: -Math.round(size * 0.32),
          }}
          title={names.slice(max).join(', ')}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

export default AvatarGroup;
