// Server-only — reads /content/changelog.md and parses ## ENTRY blocks.
// Each entry: ## VERSION — DATE\n### Title\n- bullet\n- bullet

import fs from 'fs';
import path from 'path';

export type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  bullets: string[];
};

export function loadChangelog(): ChangelogEntry[] {
  try {
    const p = path.join(process.cwd(), 'content', 'changelog.md');
    const raw = fs.readFileSync(p, 'utf8');
    const body = raw.split(/^---\s*$/m).slice(2).join('---').trim();
    const blocks = body.split(/\n## /).map((b, i) => (i === 0 ? b.replace(/^## /, '') : b));
    const entries: ChangelogEntry[] = [];
    for (const block of blocks) {
      if (!block.trim()) continue;
      const lines = block.split('\n');
      const header = lines[0];
      const m = header.match(/^([\w.-]+)\s+—\s+(\d{4}-\d{2}-\d{2})\s*$/);
      if (!m) continue;
      const version = m[1];
      const date = m[2];
      let title = '';
      const bullets: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('### ')) title = line.replace(/^###\s+/, '').trim();
        else if (line.startsWith('- ')) bullets.push(line.replace(/^-\s+/, '').trim());
      }
      if (!title) continue;
      entries.push({ version, date, title, bullets });
    }
    return entries;
  } catch {
    return [];
  }
}
