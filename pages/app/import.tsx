import { useState, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../components/AuthGuard';
import Layout from '../../components/Layout';
import { supabase } from '../../lib/supabase';
import { useMembership } from '../../lib/membershipContext';
import {
  STUDENT_SYNONYMS,
  HOUSEHOLD_SYNONYMS,
  autoMapHeaders,
  csvLine,
  type StudentField,
  type HouseholdField,
} from '../../lib/csvImport';

type Tab = 'students' | 'households';

const STUDENT_FIELD_ORDER: StudentField[] = [
  'name', 'household_name', 'subjects', 'year_level', 'pay_rate_dollars', 'notes',
];
const HOUSEHOLD_FIELD_ORDER: HouseholdField[] = [
  'household_name', 'parent_name', 'parent_email', 'parent_phone', 'billing_address', 'preferred_currency',
];

const STUDENT_REQUIRED: StudentField[] = ['name'];
const HOUSEHOLD_REQUIRED: HouseholdField[] = ['household_name', 'parent_name', 'parent_email'];

const MAX_FILE_BYTES = 10 * 1024 * 1024;

type RowOutcome = { row: number; reason: string; status: 'failed' | 'skipped' };

type ImportResult = {
  imported: number;
  skipped: number;
  outcomes: RowOutcome[];
};

function ImportInner() {
  const { t } = useTranslation(['import', 'common']);
  const { membership } = useMembership();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [tab, setTab] = useState<Tab>('students');

  const [error, setError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [studentMapping, setStudentMapping] = useState<Record<number, StudentField | 'skip'>>({});
  const [householdMapping, setHouseholdMapping] = useState<Record<number, HouseholdField | 'skip'>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [originalRowsForReport, setOriginalRowsForReport] = useState<string[][]>([]);
  const [originalHeadersForReport, setOriginalHeadersForReport] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const requiredForTab: readonly string[] = tab === 'students' ? STUDENT_REQUIRED : HOUSEHOLD_REQUIRED;
  const fieldOrderForTab: readonly string[] = tab === 'students' ? STUDENT_FIELD_ORDER : HOUSEHOLD_FIELD_ORDER;
  const mappingForTab: Record<number, string> = tab === 'students' ? studentMapping : householdMapping;
  const setOneMapping = useCallback((idx: number, value: string) => {
    if (tab === 'students') {
      setStudentMapping((prev) => ({ ...prev, [idx]: value as StudentField | 'skip' }));
    } else {
      setHouseholdMapping((prev) => ({ ...prev, [idx]: value as HouseholdField | 'skip' }));
    }
  }, [tab]);

  const reset = useCallback(() => {
    setHeaders([]);
    setRows([]);
    setStudentMapping({});
    setHouseholdMapping({});
    setResult(null);
    setError(null);
    setOriginalRowsForReport([]);
    setOriginalHeadersForReport([]);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  function switchTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    reset();
  }

  function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(t('errors.too_big', { mb: (file.size / 1024 / 1024).toFixed(1), max: 10 }));
      return;
    }
    // delimiter: '' (empty) tells papaparse to auto-detect — handles tab,
    // semicolon, and comma without us guessing. skipEmptyLines drops the
    // trailing blank lines spreadsheet exports leave behind.
    Papa.parse<string[]>(file, {
      delimiter: '',
      skipEmptyLines: 'greedy',
      complete: (parsed) => {
        if (parsed.errors.length > 0) {
          const first = parsed.errors[0];
          // FieldMismatch errors are common in dirty files (extra commas in
          // a row); they don't stop parsing — just warn and continue.
          if (first.type !== 'FieldMismatch') {
            setError(t('errors.parse_failed', { reason: first.message ?? 'unknown' }));
            return;
          }
        }
        const data = (parsed.data as string[][]).filter((r) => r.some((c) => (c ?? '').trim() !== ''));
        if (data.length === 0) { setError(t('errors.empty')); return; }
        const [hdrRaw, ...rest] = data;
        if (!hdrRaw || hdrRaw.length === 0) { setError(t('errors.no_columns')); return; }
        const hdr = hdrRaw.map((h) => stripBom((h ?? '').toString()));
        setHeaders(hdr);
        setRows(rest);
        setOriginalHeadersForReport(hdr);
        setOriginalRowsForReport(rest);
        if (tab === 'students') {
          const auto = autoMapHeaders(hdr, STUDENT_SYNONYMS);
          const m: Record<number, StudentField | 'skip'> = {};
          hdr.forEach((_, idx) => { m[idx] = auto[idx] ?? 'skip'; });
          setStudentMapping(m);
        } else {
          const auto = autoMapHeaders(hdr, HOUSEHOLD_SYNONYMS);
          const m: Record<number, HouseholdField | 'skip'> = {};
          hdr.forEach((_, idx) => { m[idx] = auto[idx] ?? 'skip'; });
          setHouseholdMapping(m);
        }
      },
      error: (err) => { setError(t('errors.parse_failed', { reason: err.message })); },
    });
  }

  const requiredMissing = useMemo(() => {
    const used = new Set(Object.values(mappingForTab));
    return requiredForTab.filter((f) => !used.has(f));
  }, [mappingForTab, requiredForTab]);

  const previewRows = useMemo(() => rows.slice(0, 10), [rows]);

  // Per-row client-side validity check used for the preview counters. The
  // server is still the source of truth, but a quick client check is what
  // makes the "Import N valid rows" button feel responsive.
  const validity = useMemo(() => {
    let valid = 0;
    let invalid = 0;
    const reasons: Array<{ row: number; reason: string }> = [];
    rows.forEach((row, ri) => {
      const obj = projectRow(row, mappingForTab);
      const missing = requiredForTab.filter((f) => !(obj[f] ?? '').toString().trim());
      if (missing.length > 0) {
        invalid++;
        reasons.push({
          row: ri + 1,
          reason: t('errors.missing_required', {
            fields: missing.map((m) => t(`field.${m}`)).join(', '),
          }),
        });
        return;
      }
      // Email shape check for households tab — quick client-side hint only.
      if (tab === 'households') {
        const email = (obj.parent_email ?? '').toString().trim();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          invalid++;
          reasons.push({ row: ri + 1, reason: t('errors.bad_email', { email }) });
          return;
        }
      }
      valid++;
    });
    return { valid, invalid, reasons };
  }, [rows, mappingForTab, requiredForTab, tab, t]);

  function buildPayload(): Array<Record<string, string>> {
    return rows.map((row) => projectRow(row, mappingForTab));
  }

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError(t('errors.not_signed_in')); return; }
      const payload = buildPayload();
      const endpoint = tab === 'students' ? '/api/import/students' : '/api/import/households';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ rows: payload }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<ImportResult> & { error?: string };
      if (!res.ok) {
        setError(json?.error ?? t('errors.commit_failed'));
        if (Array.isArray(json?.outcomes)) {
          setResult({ imported: 0, skipped: json.outcomes.length, outcomes: json.outcomes });
        }
        return;
      }
      setResult({
        imported: json.imported ?? 0,
        skipped: json.skipped ?? 0,
        outcomes: Array.isArray(json.outcomes) ? json.outcomes : [],
      });
    } finally {
      setSubmitting(false);
    }
  }

  function downloadErrorReport() {
    if (!result || result.outcomes.length === 0) return;
    const reasonByRow = new Map<number, string>();
    for (const o of result.outcomes) reasonByRow.set(o.row, `${o.status === 'skipped' ? 'Skipped' : 'Failed'}: ${o.reason}`);

    const lines: string[] = [];
    lines.push(csvLine(['_row', '_reason', ...originalHeadersForReport]));
    originalRowsForReport.forEach((row, idx) => {
      const rowNum = idx + 1;
      const reason = reasonByRow.get(rowNum);
      if (!reason) return;
      lines.push(csvLine([rowNum, reason, ...row]));
    });
    const body = lines.join('\r\n') + '\r\n';
    const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-errors-${tab}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (membership && membership.role !== 'owner') {
    return (
      <Layout title={t('page_title')} subtitle={t('page_subtitle')}>
        <div className="card p-6 max-w-xl">
          <p className="text-sm text-ink-muted">{t('owner_only')}</p>
        </div>
      </Layout>
    );
  }

  if (result) {
    return (
      <Layout title={t('page_title')} subtitle={t('page_subtitle')}>
        <div className="max-w-2xl space-y-4">
          <div className="card p-6">
            <h2 className="font-display text-2xl tracking-tightest text-ink mb-2">
              {t('result.imported_n', { count: result.imported })}
            </h2>
            {result.outcomes.length > 0 && (
              <div className="mt-4">
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">
                  {t('result.skipped_n', { count: result.outcomes.length })}
                </div>
                <ul className="text-sm text-ink-muted space-y-1 max-h-72 overflow-auto">
                  {result.outcomes.slice(0, 50).map((o) => (
                    <li key={`${o.row}-${o.reason}`}>{t('result.row_label', { row: o.row })}: {o.reason}</li>
                  ))}
                  {result.outcomes.length > 50 && (
                    <li>… {t('result.and_more', { count: result.outcomes.length - 50 })}</li>
                  )}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-3 mt-6">
              {result.outcomes.length > 0 && (
                <button onClick={downloadErrorReport} className="btn-secondary">
                  {t('result.download_errors')}
                </button>
              )}
              <Link
                href={tab === 'students' ? '/app/students' : '/app/households'}
                className="btn-primary"
              >
                {tab === 'students' ? t('result.back_to_students') : t('result.back_to_households')}
              </Link>
              <button onClick={reset} className="btn-ghost">{t('result.import_another')}</button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title={t('page_title')}
      subtitle={t('page_subtitle')}
    >
      <div className="max-w-4xl space-y-6">
        <div className="flex items-center gap-2 border-b border-rule">
          <button
            type="button"
            onClick={() => switchTab('students')}
            className={`px-4 py-2 text-sm transition-colors ${tab === 'students' ? 'text-ink border-b-2 border-forest -mb-px font-medium' : 'text-ink-muted hover:text-ink'}`}
            aria-selected={tab === 'students'}
            role="tab"
          >
            {t('tab.students')}
          </button>
          <button
            type="button"
            onClick={() => switchTab('households')}
            className={`px-4 py-2 text-sm transition-colors ${tab === 'households' ? 'text-ink border-b-2 border-forest -mb-px font-medium' : 'text-ink-muted hover:text-ink'}`}
            aria-selected={tab === 'households'}
            role="tab"
          >
            {t('tab.households')}
          </button>
        </div>

        {error && <div className="card p-4 text-sm text-claret" role="alert">{error}</div>}

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
                {t('drop.headline')}
              </p>
              <p className="text-sm text-ink-muted">{t('drop.hint')}</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,text/csv,text/tab-separated-values"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
            <div className="text-sm text-ink-muted">
              {t('drop.template_prompt')}{' '}
              <a
                href={tab === 'students' ? '/api/import/template/students' : '/api/import/template/households'}
                className="underline text-forest"
              >
                {t('drop.template_link')}
              </a>
            </div>
          </>
        ) : (
          <>
            <div className="card p-6">
              <h2 className="font-display text-xl tracking-tightest text-ink mb-2">
                {t('mapping.headline')}
              </h2>
              <p className="text-sm text-ink-muted mb-4">
                {t('mapping.required_label')}{' '}
                <strong className="text-ink">
                  {requiredForTab.map((f) => t(`field.${f}`)).join(' · ')}
                </strong>
              </p>
              <div className="space-y-3">
                {headers.map((h, idx) => (
                  <div key={`${idx}-${h}`} className="flex items-center gap-4 flex-wrap">
                    <div className="w-48 text-sm text-ink truncate" title={h}>
                      {h || t('mapping.column_n', { n: idx + 1 })}
                    </div>
                    <select
                      className="input flex-1 max-w-xs h-10"
                      value={mappingForTab[idx] ?? 'skip'}
                      onChange={(e) => setOneMapping(idx, e.target.value)}
                    >
                      <option value="skip">{t('mapping.skip')}</option>
                      {fieldOrderForTab.map((k) => (
                        <option key={k} value={k}>
                          {t(`field.${k}`)}
                          {requiredForTab.includes(k) ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                    <div className="text-2xs text-ink-muted truncate flex-1" title={previewRows[0]?.[idx] ?? ''}>
                      {previewRows[0]?.[idx] ?? ''}
                    </div>
                  </div>
                ))}
              </div>
              {requiredMissing.length > 0 && (
                <div className="mt-4 text-sm text-claret">
                  {t('mapping.missing', {
                    fields: requiredMissing.map((f) => t(`field.${f}`)).join(', '),
                  })}
                </div>
              )}
            </div>

            <div className="card p-6">
              <h2 className="font-display text-xl tracking-tightest text-ink mb-2">
                {t('preview.headline')}
              </h2>
              <p className="text-sm text-ink-muted mb-4">
                {t('preview.summary', {
                  shown: previewRows.length,
                  total: rows.length,
                  valid: validity.valid,
                  invalid: validity.invalid,
                })}
              </p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      {headers.map((h, idx) => {
                        const m = mappingForTab[idx];
                        const label = !m || m === 'skip'
                          ? <span className="text-ink-muted">{h || ''}</span>
                          : <span>{t(`field.${m}`)}</span>;
                        return <th key={idx}>{label}</th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, ri) => (
                      <tr key={ri}>
                        {headers.map((_, ci) => (
                          <td key={ci}>{r[ci] ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {validity.reasons.length > 0 && (
                <details className="mt-4">
                  <summary className="text-sm text-claret cursor-pointer">
                    {t('preview.show_errors', { count: validity.reasons.length })}
                  </summary>
                  <ul className="mt-2 text-sm text-ink-muted space-y-1 max-h-48 overflow-auto">
                    {validity.reasons.slice(0, 50).map((r) => (
                      <li key={r.row}>{t('result.row_label', { row: r.row })}: {r.reason}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                disabled={requiredMissing.length > 0 || submitting || validity.valid === 0}
                onClick={onSubmit}
                className="btn-primary"
              >
                {submitting
                  ? t('actions.importing')
                  : t('actions.import_n_valid', { count: validity.valid })}
              </button>
              <button onClick={reset} className="btn-ghost" type="button">
                {t('actions.use_different_file')}
              </button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function projectRow(row: string[], mapping: Record<number, string>): Record<string, string> {
  const obj: Record<string, string> = {};
  Object.keys(mapping).forEach((idxStr) => {
    const idx = Number(idxStr);
    const key = mapping[idx];
    if (!key || key === 'skip') return;
    if (obj[key] != null && obj[key] !== '') return; // first non-empty wins for duplicate mappings
    const val = (row[idx] ?? '').toString().trim();
    if (val !== '') obj[key] = val;
  });
  return obj;
}

function stripBom(s: string): string {
  return s.replace(/^﻿/, '');
}

export default function Page() {
  return (
    <AuthGuard>
      <ImportInner />
    </AuthGuard>
  );
}
