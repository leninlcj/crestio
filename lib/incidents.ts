// Server-only — reads /content/incidents.md.
// Stub: returns [] when no real entries.

import fs from 'fs';
import path from 'path';

export type Incident = {
  date: string;
  title: string;
  status: 'resolved' | 'monitoring' | 'investigating';
  impact: string;
  body: string;
};

export function loadIncidents(): Incident[] {
  try {
    const p = path.join(process.cwd(), 'content', 'incidents.md');
    const raw = fs.readFileSync(p, 'utf8');
    const body = raw.split(/^---\s*$/m).slice(2).join('---').trim();
    if (body.startsWith('# No public incidents')) return [];
    const blocks = body.split(/\n## /).map((b, i) => (i === 0 ? b.replace(/^## /, '') : b));
    const out: Incident[] = [];
    for (const block of blocks) {
      const lines = block.split('\n');
      const header = lines[0].trim();
      const m = header.match(/^(\d{4}-\d{2}-\d{2})\s+—\s+(.+)$/);
      if (!m) continue;
      const fields: Record<string, string> = {};
      const proseLines: string[] = [];
      let inProse = false;
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) { inProse = true; continue; }
        if (inProse) { proseLines.push(line); continue; }
        const idx = line.indexOf(':');
        if (idx > 0) {
          const k = line.slice(0, idx).trim().toLowerCase();
          const v = line.slice(idx + 1).trim();
          fields[k] = v;
        } else {
          proseLines.push(line);
        }
      }
      const status = (fields.status ?? 'resolved') as Incident['status'];
      out.push({
        date: m[1],
        title: m[2].trim(),
        status,
        impact: fields.impact ?? '',
        body: proseLines.join('\n').trim(),
      });
    }
    return out;
  } catch {
    return [];
  }
}
