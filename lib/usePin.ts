import { useCallback, useEffect, useState } from 'react';
import { authFetch } from './authFetch';
import { EntityType } from './entitySchema';

// usePin — fetch and mutate the current user's pinned items.
//
//   const { pinned, isPinned, toggle } = usePin('student');

export type Pin = {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  pinned_at: string;
  pin_order: number;
};

export function usePin(entityType?: EntityType) {
  const [pins, setPins] = useState<Pin[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const url = entityType ? `/api/pin?entity_type=${entityType}` : '/api/pin';
    const res = await authFetch(url);
    if (!res.ok) { setLoaded(true); return; }
    const data = await res.json();
    setPins(data.pins ?? []);
    setLoaded(true);
  }, [entityType]);

  useEffect(() => { void load(); }, [load]);

  const isPinned = useCallback((id: string) => pins.some((p) => p.entity_id === id), [pins]);

  const toggle = useCallback(async (type: EntityType, id: string) => {
    const wasPinned = pins.some((p) => p.entity_id === id && p.entity_type === type);
    if (wasPinned) {
      setPins((prev) => prev.filter((p) => !(p.entity_id === id && p.entity_type === type)));
      await authFetch('/api/pin', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entity_type: type, entity_id: id }),
      });
    } else {
      const optimistic: Pin = {
        id: `tmp-${id}`,
        entity_type: type,
        entity_id: id,
        pinned_at: new Date().toISOString(),
        pin_order: 0,
      };
      setPins((prev) => [optimistic, ...prev]);
      await authFetch('/api/pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entity_type: type, entity_id: id }),
      });
      void load();
    }
  }, [pins, load]);

  return { pins, loaded, isPinned, toggle, reload: load };
}
