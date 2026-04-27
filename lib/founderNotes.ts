// Server-only — reads /content/founder-notes.md and parses ## blocks.
// Each block: ## YYYY-MM-DD — Title\n\nProse...

import fs from 'fs';
import path from 'path';

export type FounderNote = {
  date: string;       // YYYY-MM-DD
  title: string;
  body: string;       // markdown-ish prose
};

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
      const prose = lines.slice(1).join('\n').trim();
      if (!title || !prose) continue;
      notes.push({ date, title, body: prose });
    }
    return notes;
  } catch {
    return [];
  }
}
