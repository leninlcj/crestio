import { useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Papa from 'papaparse';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { useMembership } from '../../../lib/membershipContext';

type FieldKey =
  | 'skip'
  | 'name'
  | 'subject'
  | 'year'
  | 'parent_name'
  | 'parent_email'
  | 'parent_phone'
  | 'hourly_rate'
  | 'notes';

const FIELD_LABELS: Record<FieldKey, string> = {
  skip: 'Skip this column',
  name: 'Name (required)',
  subject: 'Subject (required)',
  year: 'Year / Grade',
  parent_name: 'Parent Name',
  parent_email: 'Parent Email',
  parent_phone: 'Parent Phone',
  hourly_rate: 'Hourly Rate ($)',
  notes: 'Notes',
};

const REQUIRED_FIELDS: FieldKey[] = ['name', 'subject'];
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function autoDetectMapping(header: string): FieldKey {
  const h = header.trim().toLowerCase();
  if (/^(name|student\s*name|full\s*name)$/.test(h)) return 'name';
  if (/^(subject|subjects?)$/.test(h)) return 'subject';
  if (/^(year|year\s*level|grade)$/.test(h)) return 'year';
  if (/^(parent\s*name|guardian)$/.test(h)) return 'parent_name';
  if (/^(parent\s*email|email)$/.test(h)) return 'parent_email';
  if (/^(parent\s*phone|phone|mobile)$/.test(h)) return 'parent_phone';
  if (/^(hourly\s*rate|rate|price)$/.test(h)) return 'hourly_rate';
  if (/^(notes?|comment|description)$/.test(h)) return 'notes';
  return 'skip';
}

function ImportInner() {
  const router = useRouter();
  const { membership } = useMembership();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, FieldKey>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | {
    imported: number;
    failed: Array<{ row: number; reason: string }>;
    student_ids: string[];
  }>(null);
  const [dragOver, setDragOver] = useState(false);

  function reset() {
    setHeaders([]); setRows([]); setMapping({}); setResult(null); setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(`File is ${(file.size / 1024 / 1024).toFixed(1)}MB; the maximum is 5MB.`);
      return;
    }
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (parsed) => {
        if (parsed.errors.length) {
          console.error('[import-csv] parse errors', parsed.errors);
          setError(`Could not parse CSV: ${parsed.errors[0]?.message ?? 'unknown error'}.`);
          return;
        }
        const data = parsed.data as string[][];
        if (data.length === 0) {
          setError('CSV is empty.');
          return;
        }
        const [hdr, ...rest] = data;
        if (!hdr || hdr.length === 0) {
          setError('CSV has no columns.');
          return;
        }
        setHeaders(hdr.map((h) => (h ?? '').toString()));
        setRows(rest);
        const auto: Record<number, FieldKey> = {};
        hdr.forEach((h, i) => { auto[i] = autoDetectMapping(h ?? ''); });
        setMapping(auto);
      },
      error: (err) => {
        console.error('[import-csv] parse threw', err);
        setError(`Could not parse CSV: ${err.message}.`);
      },
    });
  }

  const requiredMissing = useMemo<FieldKey[]>(() => {
    const used = new Set(Object.values(mapping));
    return REQUIRED_FIELDS.filter((f) => !used.has(f));
  }, [mapping]);

  const previewRows = useMemo(() => rows.slice(0, 10), [rows]);

  function buildPayload() {
    return rows.map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((_, idx) => {
        const k = mapping[idx];
        if (!k || k === 'skip') return;
        obj[k] = (row[idx] ?? '').toString().trim();
      });
      return obj;
    });
  }

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Not signed in.'); return; }
      const payload = buildPayload();
      const res = await fetch('/api/students/import-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ rows: payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? 'Import failed.');
        if (json?.failed) setResult({ imported: 0, failed: json.failed, student_ids: [] });
        return;
      }
      setResult(json);
    } finally { setSubmitting(false); }
  }

  if (membership && membership.role !== 'owner') {
    return (
      <Layout title="Import students" subtitle="CSV bulk import">
        <div className="card p-6 max-w-xl">
          <p className="text-sm text-ink-muted">Only the organisation owner can bulk-import students.</p>
        </div>
      </Layout>
    );
  }

  if (result) {
    return (
      <Layout title="Import students" subtitle="CSV bulk import">
        <div className="max-w-2xl space-y-4">
          <div className="card p-6">
            <h2 className="font-display text-2xl tracking-tightest text-ink mb-2">
              Imported {result.imported} student{result.imported === 1 ? '' : 's'}
            </h2>
            {result.failed.length > 0 && (
              <div className="mt-4">
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">
                  {result.failed.length} skipped
                </div>
                <ul className="text-sm text-ink-muted space-y-1">
                  {result.failed.slice(0, 25).map((f) => (
                    <li key={f.row}>Row {f.row}: {f.reason}</li>
                  ))}
                  {result.failed.length > 25 && <li>… and {result.failed.length - 25} more</li>}
                </ul>
              </div>
            )}
            <div className="flex gap-3 mt-6">
              <Link href="/app/students" className="btn-primary">Back to students</Link>
              {result.imported > 0 && (
                <Link
                  href={`/app/calendar?import_ids=${result.student_ids.join(',')}`}
                  className="btn-secondary"
                >
                  Set up recurring sessions
                </Link>
              )}
              <button onClick={reset} className="btn-ghost">Import another file</button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title="Import students"
      subtitle="CSV bulk import"
      actions={<Link href="/app/students" className="btn-ghost text-xs">Back to students</Link>}
    >
      <div className="max-w-4xl space-y-6">
        {error && <div className="card p-4 text-sm text-claret">{error}</div>}

        {headers.length === 0 ? (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
              className={
                'card p-12 text-center cursor-pointer border-2 border-dashed transition-colors ' +
                (dragOver ? 'border-forest bg-forest-soft' : 'border-rule')
              }
              onClick={() => fileRef.current?.click()}
            >
              <p className="font-display text-xl tracking-tightest text-ink mb-2">
                Drop a CSV here, or click to upload
              </p>
              <p className="text-sm text-ink-muted">Max 5MB. UTF-8 encoded.</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
            <div className="text-sm text-ink-muted">
              Don&apos;t have a file ready?{' '}
              <a href="/sample-students.csv" download className="underline text-forest">
                Download the sample CSV
              </a>{' '}with all the optional columns filled in.
            </div>
          </>
        ) : (
          <>
            <div className="card p-6">
              <h2 className="font-display text-xl tracking-tightest text-ink mb-4">Map your columns</h2>
              <p className="text-sm text-ink-muted mb-4">
                Tell us what each column contains. Required: {REQUIRED_FIELDS.map((f) => FIELD_LABELS[f].replace(' (required)', '')).join(' and ')}.
              </p>
              <div className="space-y-3">
                {headers.map((h, idx) => (
                  <div key={idx} className="flex items-center gap-4">
                    <div className="w-48 text-sm text-ink truncate" title={h}>{h || `(column ${idx + 1})`}</div>
                    <select
                      className="input flex-1 max-w-xs"
                      value={mapping[idx] ?? 'skip'}
                      onChange={(e) => setMapping({ ...mapping, [idx]: e.target.value as FieldKey })}
                    >
                      {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => (
                        <option key={k} value={k}>{FIELD_LABELS[k]}</option>
                      ))}
                    </select>
                    <div className="text-2xs text-ink-muted truncate flex-1">
                      {previewRows[0]?.[idx] ?? ''}
                    </div>
                  </div>
                ))}
              </div>
              {requiredMissing.length > 0 && (
                <div className="mt-4 text-sm text-claret">
                  Map a column to: {requiredMissing.map((f) => FIELD_LABELS[f].replace(' (required)', '')).join(', ')}.
                </div>
              )}
            </div>

            <div className="card p-6">
              <h2 className="font-display text-xl tracking-tightest text-ink mb-2">Preview</h2>
              <p className="text-sm text-ink-muted mb-4">
                Showing the first {previewRows.length} of {rows.length} rows.
              </p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>{headers.map((h, idx) => (
                      <th key={idx}>
                        {FIELD_LABELS[mapping[idx] ?? 'skip'] === FIELD_LABELS.skip
                          ? <span className="text-ink-muted">{h}</span>
                          : FIELD_LABELS[mapping[idx] ?? 'skip']}
                      </th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, ri) => (
                      <tr key={ri}>{headers.map((_, ci) => (
                        <td key={ci}>{r[ci] ?? ''}</td>
                      ))}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                disabled={requiredMissing.length > 0 || submitting}
                onClick={onSubmit}
                className="btn-primary"
              >
                {submitting
                  ? 'Importing…'
                  : `Import ${rows.length} student${rows.length === 1 ? '' : 's'}`}
              </button>
              <button onClick={reset} className="btn-ghost">Use a different file</button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default function Page() {
  return (
    <AuthGuard>
      <ImportInner />
    </AuthGuard>
  );
}
