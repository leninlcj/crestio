import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuardStudent from '../../../components/AuthGuardStudent';
import StudentLayout from '../../../components/student/StudentLayout';
import { useStudentMe } from '../../../components/student/StudentContext';
import { authFetch } from '../../../lib/authFetch';

type FileRow = {
  id: string;
  display_name: string | null;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number | null;
  created_at: string;
};

function Inner() {
  const { me } = useStudentMe();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const res = await authFetch('/api/student/files');
      if (res.ok) setFiles((await res.json()).files ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <StudentLayout active="files" title="Files">
      <h1 className="font-display text-[28px] tracking-tightest">Files</h1>

      {loading ? (
        <p className="mt-6 text-sm text-ink-muted">Loading…</p>
      ) : files.length === 0 ? (
        <p className="mt-8 text-sm text-ink-muted">
          {me?.tutor.name} hasn't shared any files with you yet.
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {files.map((f) => (
            <li key={f.id}>
              <Link
                href={`/student/files/${f.id}`}
                className="card p-4 block hover:bg-ruleSoft/40 transition-colors duration-100"
              >
                <div className="text-2xs uppercase tracking-widest text-ink-muted">
                  {f.mime_type.split('/').pop()?.toUpperCase()}
                </div>
                <div className="text-sm text-ink mt-1 line-clamp-2">{f.display_name ?? f.original_filename}</div>
                <div className="text-2xs text-ink-soft mt-2 tabular">
                  Shared {formatDate(f.created_at)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </StudentLayout>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Page() {
  return <AuthGuardStudent><Inner /></AuthGuardStudent>;
}
