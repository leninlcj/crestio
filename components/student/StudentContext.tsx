import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authFetch } from '../../lib/authFetch';

// Loads the student profile + tutor branding once and shares it across
// /student/* pages so the layout/topbar can render brand colors without each
// page re-fetching.

export type StudentMe = {
  profile: {
    id: string;
    student_id: string;
    full_name: string;
    email: string;
    date_of_birth: string;
    last_login_at: string | null;
  };
  tutor: { name: string; brandColor: string | null; replyTo: string | null };
};

const Ctx = createContext<{ me: StudentMe | null; loading: boolean; reload: () => void } | null>(null);

export function StudentContextProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<StudentMe | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await authFetch('/api/student/me');
      if (res.ok) setMe(await res.json());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  return <Ctx.Provider value={{ me, loading, reload: load }}>{children}</Ctx.Provider>;
}

export function useStudentMe() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStudentMe must be inside StudentContextProvider');
  return ctx;
}
