// Static counter for the migration concierge program. Read at build time;
// manually incremented in /content/migration-counter.json when a real
// migration completes.

import fs from 'fs';
import path from 'path';

export type MigrationCounter = { spots_taken: number; total_spots: number };

const FALLBACK: MigrationCounter = { spots_taken: 0, total_spots: 100 };

export function loadMigrationCounter(): MigrationCounter {
  try {
    const p = path.join(process.cwd(), 'content', 'migration-counter.json');
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<MigrationCounter>;
    const taken = Number.isFinite(raw.spots_taken) ? Math.max(0, raw.spots_taken!) : FALLBACK.spots_taken;
    const total = Number.isFinite(raw.total_spots) ? Math.max(1, raw.total_spots!) : FALLBACK.total_spots;
    return { spots_taken: Math.min(taken, total), total_spots: total };
  } catch {
    return FALLBACK;
  }
}
