// Server-only — reads /content/founder-notes.md and parses ## blocks.
// Each block:
//   ## YYYY-MM-DD — Title
//   slug: optional-kebab (one line, optional)
//   prose...

import fs from 'fs';
import path from 'path';

export type FounderNote = {
  date: string;       // YYYY-MM-DD
  slug: string;       // kebab-case, used as anchor id and (eventually) per-note URL
  title: string;
  body: string;       // markdown-ish prose; trailing sign-off paragraph is rendered in small caps
};

function autoSlug(date: string, title: string): string {
  const titleSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join('-');
  return titleSlug || date;
}

export function loadFounderNotes(): FounderNote[] {
  try {
    const p = path.join(process.cwd(), 'content', 'founder-notes.md');
    const raw = fs.readFileSync(p, 'utf8');
    const body = raw.split(/^---\s*$/m).slice(2).join('---').trim();
    const blocks = body.split(/\n## /).map((b, i) => (i === 0 ? b.replace(/^## /, '') : b));
    const notes: FounderNote[] = [];
    for (const block of blocks) {
      const lines = block.split('\n');
      const header = lines[0].trim();
      const m = header.match(/^(\d{4}-\d{2}-\d{2})\s+—\s+(.+)$/);
      if (!m) continue;
      const date = m[1];
      const title = m[2].trim();

      let slug = autoSlug(date, title);
      let bodyStart = 1;
      const slugMatch = lines[1]?.trim().match(/^slug:\s*(.+)$/);
      if (slugMatch) {
        slug = slugMatch[1].trim();
        bodyStart = 2;
      }

      const prose = lines.slice(bodyStart).join('\n').trim();
      if (!title || !prose) continue;
      notes.push({ date, slug, title, body: prose });
    }
    return notes;
  } catch {
    return [];
  }
}
