// Copies pdfjs-dist's worker into /public so the PDF viewer can load it
// without hitting an external CDN. Runs from package.json's `postinstall`
// hook and is also safe to invoke directly (`node scripts/copy-pdf-worker.js`).

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const DEST = path.join(__dirname, '..', 'public', 'pdf.worker.min.mjs');

try {
  if (!fs.existsSync(SRC)) {
    // pdfjs-dist isn't installed yet (e.g. fresh clone before npm install).
    // Don't fail the install — Vercel will re-run postinstall on its own copy.
    console.warn('[copy-pdf-worker] source missing, skipping:', SRC);
    process.exit(0);
  }
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  fs.copyFileSync(SRC, DEST);
  console.log(`[copy-pdf-worker] ${path.relative(process.cwd(), SRC)} -> ${path.relative(process.cwd(), DEST)}`);
} catch (err) {
  console.error('[copy-pdf-worker] failed:', err);
  // Don't fail the install in dev — the page will fall back to a clear error.
  process.exit(0);
}
