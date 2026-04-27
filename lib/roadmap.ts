// Server-only — reads /content/roadmap.md and parses ## blocks.
// Each entry: ## title: ...\nstatus: ...\naudience: ...\neta: ...\ndescription: ...

import fs from 'fs';
import path from 'path';

export type RoadmapStatus = 'shipped' | 'in_progress' | 'planned';
export type RoadmapAudience = 'tutor' | 'owner' | 'parent' | 'infra';

export type RoadmapItem = {
  title: string;
  status: RoadmapStatus;
  audience: RoadmapAudience;
  eta: string | null;
  description: string;
};

function parseBlock(block: string): RoadmapItem | null {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  const fields: Record<string, string> = {};
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    fields[key.toLowerCase()] = value;
  }
  if (!fields.title || !fields.status || !fields.audience) return null;
  const status = fields.status as RoadmapStatus;
  const audience = fields.audience as RoadmapAudience;
  if (!['shipped', 'in_progress', 'planned'].includes(status)) return null;
  if (!['tutor', 'owner', 'parent', 'infra'].includes(audience)) return null;
  return {
    title: fields.title,
    status,
    audience,
    eta: fields.eta || null,
    description: fields.description ?? '',
  };
}

export function loadRoadmap(): RoadmapItem[] {
  try {
    const p = path.join(process.cwd(), 'content', 'roadmap.md');
    const raw = fs.readFileSync(p, 'utf8');
    const body = raw.split(/^---\s*$/m).slice(2).join('---').trim();
    const blocks = body.split(/\n## /).map((b, i) => (i === 0 ? b.replace(/^## /, '') : b));
    const items: RoadmapItem[] = [];
    for (const block of blocks) {
      const item = parseBlock(block);
      if (item) items.push(item);
    }
    return items;
  } catch {
    return [];
  }
}
