// Client-only PDF renderer using react-pdf (pdfjs under the hood).
//
// Replaces the previous <iframe src={signedUrl}> approach because Chrome
// blocks iframe loads of inline application/pdf without an explicit
// Content-Disposition: inline header (which Supabase's signed URLs don't
// set). Rendering through pdf.js draws the PDF onto <canvas> elements,
// which Chrome accepts unconditionally and which we can layer the
// watermark over.
//
// We disable react-pdf's text and annotation layers so the rendered file
// can't be text-selected or have clickable links (defense in depth on
// top of the parent page's right-click + keyboard shortcut blocks).
//
// Worker is served from /public/pdf.worker.min.mjs (copied from
// pdfjs-dist by scripts/copy-pdf-worker.js on `npm install`). No CDN.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

if (typeof window !== 'undefined') {
  // Pinned to the local worker copied into /public. Avoids any CDN
  // dependency and works the same in dev, preview, and prod.
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

type Props = {
  /** Signed download URL from /api/files/[id]/view-url. */
  url: string;
  /** Localized label shown while the PDF is fetching/rendering. */
  loadingLabel: string;
  /** Localized error label + retry button copy. */
  errorLabel: string;
  retryLabel: string;
  onRetry: () => void;
};

export function PdfRenderer({ url, loadingLabel, errorLabel, retryLabel, onRetry }: Props) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pageWidth, setPageWidth] = useState<number>(0);

  // Fetch the PDF body ourselves so we can surface fetch errors cleanly
  // (Document accepts ArrayBuffer/Uint8Array via the `data` prop).
  useEffect(() => {
    let cancelled = false;
    setBytes(null);
    setNumPages(null);
    setError(null);

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        setBytes(new Uint8Array(buf));
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'fetch failed');
      }
    })();

    return () => { cancelled = true; };
  }, [url]);

  // Track container width for full-bleed page rendering.
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setPageWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Memoize the data object so the Document doesn't refetch on every render.
  const fileProp = useMemo(() => (bytes ? { data: bytes } : null), [bytes]);

  return (
    <div ref={containerRef} className="w-full h-full overflow-auto bg-ink/95 flex justify-center py-6">
      {error ? (
        <div className="self-center text-cream/80 text-sm text-center px-6">
          <p>{errorLabel}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-block bg-cream text-ink px-4 py-2 rounded-full text-xs"
          >
            {retryLabel}
          </button>
        </div>
      ) : !fileProp ? (
        <div className="self-center text-cream/70 text-sm">{loadingLabel}</div>
      ) : (
        <Document
          file={fileProp}
          onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
          onLoadError={(e) => setError(e?.message ?? 'load failed')}
          loading={<div className="text-cream/70 text-sm">{loadingLabel}</div>}
          error={
            <div className="text-cream/80 text-sm text-center px-6">
              <p>{errorLabel}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-block bg-cream text-ink px-4 py-2 rounded-full text-xs"
              >
                {retryLabel}
              </button>
            </div>
          }
        >
          <div className="flex flex-col items-center gap-4">
            {Array.from({ length: numPages ?? 0 }).map((_, i) => (
              <Page
                key={i}
                pageNumber={i + 1}
                width={pageWidth ? Math.min(pageWidth - 32, 1200) : undefined}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={<div className="h-40 w-full bg-cream/5" />}
              />
            ))}
          </div>
        </Document>
      )}
    </div>
  );
}
