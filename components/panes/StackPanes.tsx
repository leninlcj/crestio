// One-per-entity-type render functions for DetailPaneStack.  Each shows a
// minimal header (name + tags) and a body.  Internal entity links inside
// each pane call helpers.push() to deepen the stack.

import { useEffect, useState } from 'react';
import { authFetch } from '../../lib/authFetch';
import { registerPaneRenderer, type PaneHelpers } from '../depth/DetailPaneStack';
import { TagInput } from '../depth/TagInput';

type AnyRow = Record<string, any>;

function PaneShell({
  title, sublabel, children, entityType, entityId,
}: {
  title: string;
  sublabel?: string;
  children: React.ReactNode;
  entityType: string;
  entityId: string;
}) {
  return (
    <div className="p-5 space-y-4">
      <div>
        <div className="text-2xs uppercase tracking-widest text-ink-muted capitalize">{entityType.replace('_', ' ')}</div>
        <h2 className="font-display text-2xl tracking-tightest leading-tight mt-0.5">{title}</h2>
        {sublabel && <p className="text-sm text-ink-muted mt-0.5">{sublabel}</p>}
      </div>
      <div>
        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1.5">Tags</div>
        <TagInput entityType={entityType} entityId={entityId} />
      </div>
      {children}
    </div>
  );
}

function Loader() {
  return <div className="p-6 text-sm text-ink-muted">Loading…</div>;
}

function ErrState({ msg }: { msg: string }) {
  return <div className="p-6 text-sm text-claret">{msg}</div>;
}

// ----------------------------------------------------------------------
// Student
// ----------------------------------------------------------------------
function StudentPaneInner({ id, helpers: _helpers }: { id: string; helpers: PaneHelpers }) {
  const [stats, setStats] = useState<AnyRow | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await authFetch(`/api/hover-stats/student/${id}`);
      if (cancelled) return;
      if (!res.ok) { setErr('Could not load student.'); return; }
      setStats(await res.json());
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (err) return <ErrState msg={err} />;
  if (!stats) return <Loader />;

  return (
    <PaneShell title={stats.label} sublabel={stats.sublabel} entityType="student" entityId={id}>
      <ul className="grid grid-cols-2 gap-2 text-2xs">
        {(stats.stats ?? []).map((s: any, i: number) => (
          <li key={i} className="border border-rule rounded p-2">
            <div className="text-ink-soft uppercase tracking-widest text-2xs">{s.label}</div>
            <div className="text-ink mt-0.5">{s.value}</div>
          </li>
        ))}
      </ul>
      <div className="text-2xs text-ink-soft">
        <a href={`/app/students/${id}`} className="underline-offset-2 hover:underline">Open full page →</a>
      </div>
    </PaneShell>
  );
}

// ----------------------------------------------------------------------
// Session
// ----------------------------------------------------------------------
function SessionPaneInner({ id, helpers: _helpers }: { id: string; helpers: PaneHelpers }) {
  const [stats, setStats] = useState<AnyRow | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await authFetch(`/api/hover-stats/session/${id}`);
      if (!res.ok) { setErr('Could not load session.'); return; }
      setStats(await res.json());
    })();
  }, [id]);

  if (err) return <ErrState msg={err} />;
  if (!stats) return <Loader />;

  return (
    <PaneShell title={stats.label} sublabel={stats.sublabel} entityType="session" entityId={id}>
      <ul className="grid grid-cols-2 gap-2 text-2xs">
        {(stats.stats ?? []).map((s: any, i: number) => (
          <li key={i} className="border border-rule rounded p-2">
            <div className="text-ink-soft uppercase tracking-widest text-2xs">{s.label}</div>
            <div className="text-ink mt-0.5">{s.value}</div>
          </li>
        ))}
      </ul>
      <div className="text-2xs text-ink-soft">
        <a href={`/app/sessions/${id}`} className="underline-offset-2 hover:underline">Open full page →</a>
      </div>
    </PaneShell>
  );
}

// ----------------------------------------------------------------------
// Generic stat-only pane for parent / tutor / invoice / file / lesson_plan / household
// ----------------------------------------------------------------------
function GenericPaneInner({ type, id, fullPagePath }: { type: 'parent'|'tutor'|'invoice'|'file'|'lesson_plan'|'household'; id: string; fullPagePath?: string }) {
  const [stats, setStats] = useState<AnyRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const res = await authFetch(`/api/hover-stats/${type}/${id}`);
      if (!res.ok) { setErr(`Could not load ${type}.`); return; }
      setStats(await res.json());
    })();
  }, [type, id]);
  if (err) return <ErrState msg={err} />;
  if (!stats) return <Loader />;
  return (
    <PaneShell title={stats.label} sublabel={stats.sublabel} entityType={type} entityId={id}>
      <ul className="grid grid-cols-2 gap-2 text-2xs">
        {(stats.stats ?? []).map((s: any, i: number) => (
          <li key={i} className="border border-rule rounded p-2">
            <div className="text-ink-soft uppercase tracking-widest text-2xs">{s.label}</div>
            <div className="text-ink mt-0.5 break-words">{s.value}</div>
          </li>
        ))}
      </ul>
      {fullPagePath && (
        <div className="text-2xs text-ink-soft">
          <a href={fullPagePath} className="underline-offset-2 hover:underline">Open full page →</a>
        </div>
      )}
    </PaneShell>
  );
}

// Register all pane types with the stack.
registerPaneRenderer('student',     (p, helpers) => <StudentPaneInner id={p.id} helpers={helpers} />);
registerPaneRenderer('session',     (p, helpers) => <SessionPaneInner id={p.id} helpers={helpers} />);
registerPaneRenderer('parent',      (p) => <GenericPaneInner type="parent" id={p.id} />);
registerPaneRenderer('tutor',       (p) => <GenericPaneInner type="tutor" id={p.id} />);
registerPaneRenderer('invoice',     (p) => <GenericPaneInner type="invoice" id={p.id} fullPagePath={`/app/invoices/${p.id}`} />);
registerPaneRenderer('file',        (p) => <GenericPaneInner type="file" id={p.id} />);
registerPaneRenderer('lesson_plan', (p) => <GenericPaneInner type="lesson_plan" id={p.id} />);
registerPaneRenderer('household',   (p) => <GenericPaneInner type="household" id={p.id} fullPagePath={`/app/households/${p.id}`} />);

export {};
