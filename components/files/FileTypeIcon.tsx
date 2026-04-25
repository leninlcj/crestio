// Inline SVG icon hinting at the file's content type. Tiny, no external deps.

type Props = { mime: string; className?: string };

export function FileTypeIcon({ mime, className = 'w-4 h-4' }: Props) {
  const isPdf = mime === 'application/pdf';
  const isImage = mime.startsWith('image/');
  if (isImage) {
    return (
      <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
        <circle cx="5.5" cy="6" r="1" />
        <path d="M2 12 6 8l3 3 2-2 3 3" />
      </svg>
    );
  }
  if (isPdf) {
    return (
      <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <path d="M3 1.5h6.5L13 5v9a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 14V1.5Z" />
        <path d="M9.5 1.5V5H13" />
        <text x="5" y="12" fontSize="3.5" fontFamily="monospace" stroke="none" fill="currentColor">PDF</text>
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M3 1.5h6.5L13 5v9a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 14V1.5Z" />
      <path d="M9.5 1.5V5H13" />
    </svg>
  );
}
