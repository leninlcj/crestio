import { useCallback } from 'react';
import { authFetch } from './authFetch';
import { EntityType } from './entitySchema';

// useSnooze — exposes both server-side snooze (for entities with snoozed_until)
// and a localStorage fallback (for nudges, messages and other ephemeral items).
// Server-side: students, sessions, invoices, session_templates.

export type SnoozePreset =
  | 'tomorrow_morning'
  | 'this_evening'
  | 'next_monday'
  | { date: string };  // ISO yyyy-mm-ddThh:mm

const SERVER_TYPES: EntityType[] = ['student', 'session', 'invoice', 'session_template'];

function presetToISO(preset: SnoozePreset): string {
  const now = new Date();
  if (typeof preset === 'object' && preset.date) return preset.date;
  if (preset === 'tomorrow_morning') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d.toISOString();
  }
  if (preset === 'this_evening') {
    const d = new Date(now);
    d.setHours(19, 0, 0, 0);
    if (d.getTime() < now.getTime()) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
  if (preset === 'next_monday') {
    const d = new Date(now);
    const day = d.getDay();
    const offset = (day === 1 ? 7 : (8 - day) % 7 || 7);
    d.setDate(d.getDate() + offset);
    d.setHours(8, 0, 0, 0);
    return d.toISOString();
  }
  return now.toISOString();
}

const LS_KEY = 'crestio.snooze.local';
function readLocal(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(window.localStorage.getItem(LS_KEY) ?? '{}'); } catch { return {}; }
}
function writeLocal(map: Record<string, string>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LS_KEY, JSON.stringify(map));
}

export function useSnooze() {
  const snooze = useCallback(async (
    entity_type: EntityType,
    entity_id: string,
    preset: SnoozePreset,
  ) => {
    const until = presetToISO(preset);
    if (SERVER_TYPES.includes(entity_type)) {
      await authFetch('/api/snooze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entity_type, entity_id, until }),
      });
    } else {
      const map = readLocal();
      map[`${entity_type}:${entity_id}`] = until;
      writeLocal(map);
    }
    return until;
  }, []);

  const unsnooze = useCallback(async (entity_type: EntityType, entity_id: string) => {
    if (SERVER_TYPES.includes(entity_type)) {
      await authFetch('/api/snooze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entity_type, entity_id, until: null }),
      });
    } else {
      const map = readLocal();
      delete map[`${entity_type}:${entity_id}`];
      writeLocal(map);
    }
  }, []);

  const isLocallySnoozed = useCallback((entity_type: EntityType, entity_id: string): string | null => {
    const map = readLocal();
    const v = map[`${entity_type}:${entity_id}`];
    if (!v) return null;
    if (new Date(v).getTime() < Date.now()) {
      delete map[`${entity_type}:${entity_id}`];
      writeLocal(map);
      return null;
    }
    return v;
  }, []);

  return { snooze, unsnooze, isLocallySnoozed };
}
