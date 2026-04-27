import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from '../../lib/supabase';

export type ParentOverview = {
  parent: { name: string | null; email: string | null };
  students: Array<{
    id: string;
    name: string;
    year_level: string | null;
    subjects: string[] | null;
    household_id: string | null;
    household_name: string | null;
    outstanding_cents: number;
  }>;
  this_week_sessions: Array<{
    id: string;
    student_id: string;
    student_name: string;
    subject: string | null;
    scheduled_at: string;
    duration_minutes: number;
    status: string;
    tutor_name: string | null;
    proposed_change_by?: string | null;
    proposed_new_start_time?: string | null;
  }>;
  recent_updates: Array<{
    id: string;
    student_id: string;
    student_name: string | null;
    content: string;
    created_at: string;
    created_by_name: string;
  }>;
  stats: {
    sessions_this_month: number;
    sessions_this_year: number;
    outstanding_cents: number;
    paid_cents: number;
  };
  primary_tutor?: { name: string | null } | null;
  primary_organization?: { name: string | null; brand_color: string | null } | null;
};

type Ctx = {
  overview: ParentOverview | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  browserTitle: string;
  parentFirstName: string | null;
  primaryTutorName: string | null;
  primaryOrgName: string | null;
};

const ParentCtx = createContext<Ctx | null>(null);

export function ParentContextProvider({ children }: { children: ReactNode }) {
  const [overview, setOverview] = useState<ParentOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setLoading(false);
        return;
      }
      const res = await fetch('/api/parent/overview', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setError('Could not load.');
        setLoading(false);
        return;
      }
      setOverview(await res.json());
    } catch {
      setError('Could not load.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  const ctx: Ctx = useMemo(() => {
    const childNames = (overview?.students ?? []).map((s) => s.name).filter(Boolean);
    const browserTitle = childNames.length
      ? `${childNames.join(', ')} · Crestio`
      : 'Crestio';
    return {
      overview,
      loading,
      error,
      reload,
      browserTitle,
      parentFirstName: overview?.parent?.name ? overview.parent.name.split(' ')[0] : null,
      primaryTutorName: overview?.primary_tutor?.name ?? null,
      primaryOrgName: overview?.primary_organization?.name ?? null,
    };
  }, [overview, loading, error]);

  return <ParentCtx.Provider value={ctx}>{children}</ParentCtx.Provider>;
}

export function useParentContext(): Ctx {
  const v = useContext(ParentCtx);
  if (!v) throw new Error('useParentContext must be used inside ParentLayout');
  return v;
}
