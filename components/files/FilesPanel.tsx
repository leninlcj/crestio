// Reusable Files panel — used on student detail, session detail (filtered to
// session_id), and the org library page. Handles upload (init → uploadToSignedUrl
// → finalize), list, rename, move, delete, and links to the protected viewer.
//
// Keeps the storage cap UI front-and-centre: progress bar + warning at 80%
// + "Storage full" disabled state at 100%. Per-tier hint copy is sourced
// from the storage-usage endpoint (server is the truth).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { formatBytes, isExecutableFilename, hasPathTraversal, ALLOWED_BASE_MIME_TYPES } from '../../lib/files';
import { FileTypeIcon } from './FileTypeIcon';
import EmptyState from '../EmptyState';
import { IconFolder } from '../design/icons';

function FilesEmptyState({ message }: { message: string }) {
  return <EmptyState icon={<IconFolder />} title={message} />;
}

type FileRow = {
  id: string;
  organization_id: string;
  uploaded_by_user_id: string | null;
  student_id: string | null;
  session_id: string | null;
  original_filename: string;
  display_name: string;
  mime_type: string;
  file_size_bytes: number;
  is_org_library: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  allow_printing: boolean;
  view_count?: number;
  last_viewed_at?: string | null;
};

type StorageUsage = {
  plan_tier: 'solo' | 'team' | 'growth';
  used_bytes: number;
  cap_bytes: number;
  max_file_bytes: number;
  org_library: boolean;
  search: boolean;
  watermark: boolean;
  office_conversion: boolean;
};

type Scope =
  | { kind: 'student'; student_id: string; allow_session_attach?: { session_id: string } }
  | { kind: 'session'; session_id: string; student_id: string }
  | { kind: 'library' }
  | { kind: 'org_browse'; student_id?: string };

type Props = {
  scope: Scope;
  /** Show search + filter UI (Team only — server enforces). */
  showSearch?: boolean;
  /** Available student picker for "move" modal. */
  students?: Array<{ id: string; name: string }>;
  className?: string;
};

const ACCEPT = ALLOWED_BASE_MIME_TYPES.join(',');

export function FilesPanel({ scope, showSearch = false, students = [], className = '' }: Props) {
  const { t } = useTranslation('files');
  const [files, setFiles] = useState<FileRow[]>([]);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Record<string, { name: string; pct: number; error?: string }>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveId, setMoveId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState('');
  const [expandedAnalytics, setExpandedAnalytics] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (scope.kind === 'student') params.set('student_id', scope.student_id);
    if (scope.kind === 'session') params.set('session_id', scope.session_id);
    if (scope.kind === 'library') params.set('is_org_library', '1');
    if (scope.kind === 'org_browse' && scope.student_id) params.set('student_id', scope.student_id);
    if (search) params.set('search', search);
    const { data: { session: auth } } = await supabase.auth.getSession();
    if (!auth?.access_token) { setLoading(false); return; }
    const res = await fetch(`/api/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${auth.access_token}` },
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload?.error ?? 'Could not load files.');
      setLoading(false);
      return;
    }
    const payload = await res.json();
    setFiles(payload.files ?? []);
    setError(null);
    setLoading(false);
  }, [scope, search]);

  const loadUsage = useCallback(async () => {
    const { data: { session: auth } } = await supabase.auth.getSession();
    if (!auth?.access_token) return;
    const res = await fetch('/api/files/storage-usage', {
      headers: { Authorization: `Bearer ${auth.access_token}` },
    });
    if (res.ok) setUsage(await res.json());
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadUsage(); }, [loadUsage]);

  const usagePct = usage && usage.cap_bytes > 0
    ? Math.min(100, (usage.used_bytes / usage.cap_bytes) * 100)
    : 0;
  const usageWarn = usagePct >= 80 && usagePct < 100;
  const usageFull = usagePct >= 100;

  async function handleFiles(fileList: FileList | File[]) {
    const arr = Array.from(fileList);
    if (arr.length === 0) return;
    if (!usage) return;

    for (const f of arr) {
      const transientId = `tmp-${Math.random().toString(36).slice(2)}`;
      setUploads((u) => ({ ...u, [transientId]: { name: f.name, pct: 0 } }));

      // Local guards (server is authoritative).
      if (hasPathTraversal(f.name) || isExecutableFilename(f.name)) {
        setUploads((u) => ({ ...u, [transientId]: { name: f.name, pct: 0, error: t('errors.unsafe_filename') } }));
        continue;
      }
      if (f.size > usage.max_file_bytes) {
        setUploads((u) => ({
          ...u,
          [transientId]: {
            name: f.name,
            pct: 0,
            error: t('errors.file_too_large', { max: formatBytes(usage.max_file_bytes) }),
          },
        }));
        continue;
      }
      if (usage.used_bytes + f.size > usage.cap_bytes) {
        setUploads((u) => ({
          ...u,
          [transientId]: { name: f.name, pct: 0, error: t('errors.org_storage_full') },
        }));
        continue;
      }

      try {
        const { data: { session: auth } } = await supabase.auth.getSession();
        if (!auth?.access_token) throw new Error(t('errors.not_signed_in'));

        const initBody: Record<string, unknown> = {
          original_filename: f.name,
          mime_type: f.type || 'application/octet-stream',
          file_size_bytes: f.size,
          display_name: f.name,
        };
        if (scope.kind === 'student') initBody.student_id = scope.student_id;
        if (scope.kind === 'session') {
          initBody.session_id = scope.session_id;
          initBody.student_id = scope.student_id;
        }
        if (scope.kind === 'library') initBody.is_org_library = true;
        if (scope.kind === 'org_browse' && scope.student_id) initBody.student_id = scope.student_id;

        const initRes = await fetch('/api/files/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.access_token}` },
          body: JSON.stringify(initBody),
        });
        const initPayload = await initRes.json().catch(() => ({}));
        if (!initRes.ok) throw new Error(initPayload?.message || initPayload?.error || t('errors.upload_failed'));

        setUploads((u) => ({ ...u, [transientId]: { name: f.name, pct: 10 } }));

        const { error: uploadErr } = await supabase.storage
          .from('files')
          .uploadToSignedUrl(initPayload.file.storage_path, initPayload.signed_upload_token, f, {
            contentType: f.type || 'application/octet-stream',
          });
        if (uploadErr) throw new Error(uploadErr.message ?? t('errors.upload_failed'));

        setUploads((u) => ({ ...u, [transientId]: { name: f.name, pct: 90 } }));

        const finalizeRes = await fetch(`/api/files/${initPayload.file.id}/finalize`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${auth.access_token}` },
        });
        if (!finalizeRes.ok) {
          const finalizePayload = await finalizeRes.json().catch(() => ({}));
          throw new Error(finalizePayload?.error ?? t('errors.finalize_failed'));
        }

        setUploads((u) => ({ ...u, [transientId]: { name: f.name, pct: 100 } }));
        // Auto-clear progress 1.5s later.
        setTimeout(() => {
          setUploads((u) => {
            const next = { ...u };
            delete next[transientId];
            return next;
          });
        }, 1500);
      } catch (e: any) {
        setUploads((u) => ({ ...u, [transientId]: { name: f.name, pct: 0, error: e?.message ?? t('errors.upload_failed') } }));
      }
    }

    await Promise.all([loadList(), loadUsage()]);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (usageFull) return;
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }
  function onDragOver(e: React.DragEvent<HTMLDivElement>) { e.preventDefault(); }

  async function startRename(f: FileRow) {
    setRenameId(f.id);
    setRenameValue(f.display_name);
  }
  async function commitRename() {
    if (!renameId) return;
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenameId(null); return; }
    const { data: { session: auth } } = await supabase.auth.getSession();
    if (!auth?.access_token) return;
    const res = await fetch(`/api/files/${renameId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.access_token}` },
      body: JSON.stringify({ display_name: trimmed }),
    });
    if (res.ok) {
      setFiles((xs) => xs.map((x) => (x.id === renameId ? { ...x, display_name: trimmed } : x)));
    }
    setRenameId(null);
  }

  async function commitMove() {
    if (!moveId || !moveTarget) return;
    const { data: { session: auth } } = await supabase.auth.getSession();
    if (!auth?.access_token) return;
    const res = await fetch(`/api/files/${moveId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.access_token}` },
      body: JSON.stringify({ student_id: moveTarget }),
    });
    if (res.ok) {
      setMoveId(null); setMoveTarget('');
      await loadList();
    }
  }

  async function toggleAllowPrinting(f: FileRow) {
    const next = !f.allow_printing;
    setFiles((xs) => xs.map((x) => (x.id === f.id ? { ...x, allow_printing: next } : x)));
    const { data: { session: auth } } = await supabase.auth.getSession();
    if (!auth?.access_token) return;
    const res = await fetch(`/api/files/${f.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.access_token}` },
      body: JSON.stringify({ allow_printing: next }),
    });
    if (!res.ok) {
      setFiles((xs) => xs.map((x) => (x.id === f.id ? { ...x, allow_printing: !next } : x)));
    }
  }

  async function deleteFile(id: string) {
    if (!window.confirm(t('confirm.delete'))) return;
    const { data: { session: auth } } = await supabase.auth.getSession();
    if (!auth?.access_token) return;
    const res = await fetch(`/api/files/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${auth.access_token}` },
    });
    if (res.ok) {
      setFiles((xs) => xs.filter((x) => x.id !== id));
      await loadUsage();
    }
  }

  const emptyState = useMemo(() => {
    if (scope.kind === 'session') return t('empty.session');
    if (scope.kind === 'library') return t('empty.library');
    return t('empty.student');
  }, [scope.kind, t]);

  return (
    <div className={className}>
      {usage && (
        <div className="mb-4">
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-2xs uppercase tracking-widest text-ink-muted">
              {t('usage.label')}
            </div>
            <div className={`text-xs font-mono ${usageFull ? 'text-claret' : usageWarn ? 'text-rust' : 'text-ink-muted'}`}>
              {formatBytes(usage.used_bytes)} {t('usage.of')} {formatBytes(usage.cap_bytes)}
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-rule overflow-hidden">
            <div
              className={`h-full transition-all ${usageFull ? 'bg-claret' : usageWarn ? 'bg-rust' : 'bg-forest'}`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          {usageWarn && !usageFull && (
            <div className="text-2xs text-rust mt-1">{t('usage.warn_80')}</div>
          )}
          {usageFull && (
            <div className="text-2xs text-claret mt-1">{t('usage.full')}</div>
          )}
        </div>
      )}

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        className={`card p-5 mb-5 ${usageFull ? 'opacity-50' : ''}`}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">
              {t('upload.label')}
            </div>
            <p className="text-sm text-ink-muted">
              {t('upload.hint')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              disabled={usageFull}
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary text-xs"
              title={usageFull ? t('usage.full_tooltip') : ''}
            >
              {t('upload.button')}
            </button>
          </div>
        </div>
        {Object.entries(uploads).length > 0 && (
          <ul className="mt-4 space-y-2">
            {Object.entries(uploads).map(([id, u]) => (
              <li key={id} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{u.name}</span>
                  {u.error
                    ? <span className="text-claret">{u.error}</span>
                    : <span className="text-ink-muted font-mono">{u.pct}%</span>}
                </div>
                {!u.error && (
                  <div className="h-1 mt-1 rounded-full bg-rule overflow-hidden">
                    <div className="h-full bg-forest" style={{ width: `${u.pct}%` }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {showSearch && (
        <div className="mb-4">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search.placeholder')}
            className="input text-sm"
          />
        </div>
      )}

      {error && (
        <div className="card p-4 text-sm text-claret mb-4">{error}</div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card p-4 flex items-center gap-3">
              <div className="skeleton-shimmer rounded h-9 w-9 shrink-0" />
              <div className="flex-1">
                <div className="skeleton-shimmer rounded h-3.5 w-1/2 mb-2" />
                <div className="skeleton-shimmer rounded h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : files.length === 0 ? (
        <FilesEmptyState message={emptyState} />
      ) : (
        <div className="space-y-2">
          {files.map((f) => (
            <div
              key={f.id}
              className="group card p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 transition-colors duration-200 ease-out hover:border-rule/80 hover:bg-ruleSoft/30"
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <span className="text-ink-muted mt-0.5 shrink-0"><FileTypeIcon mime={f.mime_type} /></span>
                <div className="min-w-0">
                  {renameId === f.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setRenameId(null);
                      }}
                      className="input text-sm"
                    />
                  ) : (
                    <Link
                      href={`/files/${f.id}`}
                      className="text-sm text-ink hover:text-forest underline-offset-2 hover:underline truncate block transition-colors duration-200"
                    >
                      {f.display_name}
                    </Link>
                  )}
                  <div className="text-2xs text-ink-soft mt-0.5">
                    {formatBytes(f.file_size_bytes)} · {new Date(f.created_at).toLocaleDateString()}
                    {(f.view_count ?? 0) > 0 && (
                      <>
                        {' · '}
                        <button
                          type="button"
                          onClick={() => setExpandedAnalytics((id) => (id === f.id ? null : f.id))}
                          className="underline underline-offset-2 hover:text-ink transition-colors duration-200"
                        >
                          {t('viewed_count', { count: f.view_count ?? 0 })}
                        </button>
                      </>
                    )}
                    {f.status !== 'ready' && (
                      <span className="ml-2 badge-neutral">{f.status}</span>
                    )}
                  </div>
                  {expandedAnalytics === f.id && <FileAnalytics fileId={f.id} />}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label
                  className="flex items-center gap-1.5 text-2xs text-ink-muted cursor-pointer select-none"
                  title={t('toggle.allow_printing_help')}
                >
                  <input
                    type="checkbox"
                    checked={f.allow_printing}
                    onChange={() => toggleAllowPrinting(f)}
                    className="h-3 w-3"
                  />
                  {t('toggle.allow_printing')}
                </label>
                {/* Hover-revealed actions on desktop. Always visible on touch
                    so iOS/Android users still have access without a hover. */}
                <div className="flex items-center gap-1 transition-opacity duration-200 ease-out md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                  <button type="button" onClick={() => startRename(f)} className="btn-ghost text-2xs">
                    {t('actions.rename')}
                  </button>
                  {students.length > 0 && !f.is_org_library && (
                    <button
                      type="button"
                      onClick={() => { setMoveId(f.id); setMoveTarget(f.student_id ?? ''); }}
                      className="btn-ghost text-2xs"
                    >
                      {t('actions.move')}
                    </button>
                  )}
                  <button type="button" onClick={() => deleteFile(f.id)} className="btn-ghost text-2xs text-claret">
                    {t('actions.delete')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {moveId && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6"
             onClick={() => setMoveId(null)}>
          <div className="card p-6 w-full max-w-md bg-cream" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-xl tracking-tightest mb-4">{t('move.title')}</h3>
            <select
              className="input text-sm w-full mb-4"
              value={moveTarget}
              onChange={(e) => setMoveTarget(e.target.value)}
            >
              <option value="">{t('move.pick_student')}</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setMoveId(null)} className="btn-ghost text-xs">{t('common.cancel')}</button>
              <button type="button" onClick={commitMove} disabled={!moveTarget} className="btn-primary text-xs">
                {t('move.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FileAnalytics({ fileId }: { fileId: string }) {
  const { t } = useTranslation('files');
  const [viewers, setViewers] = useState<Array<{ id: string; viewer_email: string | null; viewer_name: string | null; viewer_role: string; viewed_at: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (!auth?.access_token) return;
      const res = await fetch(`/api/files/${fileId}`, {
        headers: { Authorization: `Bearer ${auth.access_token}` },
      });
      if (res.ok) {
        const payload = await res.json();
        setViewers(payload.viewers ?? []);
      }
      setLoading(false);
    })();
  }, [fileId]);

  if (loading) return <div className="text-2xs text-ink-soft mt-2 italic">{t('loading')}</div>;
  if (viewers.length === 0) return <div className="text-2xs text-ink-soft mt-2 italic">{t('analytics.none')}</div>;

  return (
    <ul className="mt-2 space-y-1 text-2xs text-ink-soft">
      {viewers.slice(0, 20).map((v) => (
        <li key={v.id}>
          <span className="text-ink">{v.viewer_email ?? v.viewer_name ?? t('analytics.unknown_viewer')}</span>
          <span className="text-ink-soft"> · {v.viewer_role} · {new Date(v.viewed_at).toLocaleString()}</span>
        </li>
      ))}
      {viewers.length > 20 && (
        <li className="italic">+{viewers.length - 20} {t('analytics.more')}</li>
      )}
    </ul>
  );
}
