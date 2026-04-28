import { useMemo } from 'react';
import { supabase } from '../../lib/supabase';

type Props = {
  studentId: string;
  studentName: string;
  // The earliest session for the student — used to enumerate eligible terms.
  earliestSessionAt: string | null;
  // Tutor-side: when true, shows a "Generate now" button per term.
  isTutor?: boolean;
};

export default function TermReportsList({ studentId, studentName, earliestSessionAt, isTutor = false }: Props) {
  const terms = useMemo(() => listAvailableTerms(earliestSessionAt), [earliestSessionAt]);

  if (terms.length === 0) {
    return (
      <section className="rounded-md border border-rule bg-surface p-5">
        <h2 className="text-2xs uppercase tracking-widest text-ink-soft mb-2">Term reports</h2>
        <p className="text-2xs text-ink-muted leading-relaxed">
          Reports become available after a term has finished. Once {studentName.split(' ')[0]} has been with us for a quarter, you'll find a downloadable PDF here.
        </p>
      </section>
    );
  }

  async function downloadTerm(term: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const url = `/api/parent/term-report?student_id=${studentId}&term=${term}&download=1`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (!res.ok) {
      alert('Could not generate the report.');
      return;
    }
    const blob = await res.blob();
    const objUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = `${studentName.replace(/\s+/g, '-')}-${term}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(objUrl);
  }

  return (
    <section className="rounded-md border border-rule bg-surface">
      <div className="px-5 py-3 border-b border-rule">
        <h2 className="text-2xs uppercase tracking-widest text-ink-soft m-0">Term reports</h2>
      </div>
      <ul className="divide-y divide-ruleSoft">
        {terms.map((t) => (
          <li key={t.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">{t.label}</div>
              <div className="text-2xs text-ink-soft">{t.dateRange}</div>
            </div>
            <button
              type="button"
              onClick={() => downloadTerm(t.id)}
              className="shrink-0 text-2xs font-medium text-forest hover:underline inline-flex items-center gap-1.5"
            >
              {isTutor ? 'Generate' : 'Download'} <DownloadIcon />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DownloadIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
}

type TermEntry = { id: string; label: string; dateRange: string };

function listAvailableTerms(earliestSessionAt: string | null): TermEntry[] {
  if (!earliestSessionAt) return [];
  const start = new Date(earliestSessionAt);
  if (Number.isNaN(start.getTime())) return [];
  const out: TermEntry[] = [];
  // Aussie terms: T1 Feb-Apr (1-4), T2 May-Jul (4-7), T3 Aug-Oct (7-10), T4 Oct-Dec (10-13)
  const ranges: Array<[number, [number, number]]> = [
    [1, [1, 4]], [2, [4, 7]], [3, [7, 10]], [4, [10, 13]],
  ];
  const startYear = start.getFullYear();
  const now = new Date();
  for (let year = startYear; year <= now.getFullYear(); year++) {
    for (const [q, [m0, m1]] of ranges) {
      const termStart = new Date(year, m0 - 1, 1);
      const termEnd = new Date(year + (m1 > 12 ? 1 : 0), (m1 - 1) % 12, 0);
      if (termStart < start) continue;
      if (termEnd > now) continue;
      const dateRange = `${termStart.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${termEnd.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
      out.push({ id: `${year}-T${q}`, label: `Term ${q} · ${year}`, dateRange });
    }
  }
  return out.reverse();
}
