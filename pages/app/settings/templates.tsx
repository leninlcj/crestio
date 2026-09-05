import { useEffect, useState } from 'react';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import SettingsTabs from '../../../components/SettingsTabs';
import { authFetch } from '../../../lib/authFetch';
import { renderTemplate, TEMPLATE_VARS_CATALOG } from '../../../lib/templates/render';
import { useToast } from '../../../components/design/Toast';
import { undoStack } from '../../../lib/undoStack';

type Kind = 'message' | 'note' | 'invoice';

type Template = {
  id: string;
  kind: Kind;
  name: string;
  body: string;
  variables: unknown[];
  is_default: boolean;
  usage_count: number;
};

const KIND_LABELS: Record<Kind, string> = {
  message: 'Messages',
  note: 'Notes',
  invoice: 'Invoices',
};

function Inner() {
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('message');
  const [list, setList] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await authFetch(`/api/templates?kind=${kind}`);
    if (res.ok) setList((await res.json()).templates ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); /* eslint-disable-line */ }, [kind]);

  async function save(t: Partial<Template> & { id?: string }) {
    if (t.id) {
      const res = await authFetch(`/api/templates/${t.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: t.name, body: t.body, is_default: t.is_default, kind: t.kind }),
      });
      if (!res.ok) { toast.show({ message: 'Could not save.', tone: 'error' }); return; }
      toast.show({ message: 'Saved.', tone: 'success' });
    } else {
      const res = await authFetch(`/api/templates`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: t.kind ?? kind, name: t.name, body: t.body, is_default: !!t.is_default }),
      });
      if (!res.ok) { toast.show({ message: 'Could not create.', tone: 'error' }); return; }
      toast.show({ message: 'Created.', tone: 'success' });
    }
    setEditing(null); setCreating(false);
    await load();
  }

  async function remove(t: Template) {
    const res = await authFetch(`/api/templates/${t.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.show({ message: 'Could not delete.', tone: 'error' }); return; }
    const data = await res.json();
    setList((prev) => prev.filter((x) => x.id !== t.id));
    undoStack.push({
      label: `Deleted template "${t.name}".`,
      undo: async () => {
        if (!data.snapshot) return;
        await authFetch('/api/templates', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: data.snapshot.kind,
            name: data.snapshot.name ?? data.snapshot.title,
            body: data.snapshot.body_text ?? (data.snapshot.body as any)?.text ?? '',
            is_default: data.snapshot.is_default,
          }),
        });
        await load();
      },
    });
    toast.show({ message: 'Deleted. Undo (⌘Z)', tone: 'info' });
  }

  return (
    <Layout pageTitle="Templates" title="Templates" subtitle="Settings">
      <SettingsTabs />

      <div className="max-w-4xl">
        <p className="text-sm text-ink-muted mb-4">
          Save common messages, session notes, and invoice line items so you can drop them in with one click.
          Variables like <code>{'{{student.first_name}}'}</code> get replaced when you use the template.
        </p>

        <div className="flex gap-1 border-b border-rule mb-5">
          {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              role="tab"
              aria-selected={kind === k}
              className={[
                'px-4 py-2 text-sm border-b-2 -mb-px transition-colors duration-100',
                kind === k ? 'border-forest text-ink font-medium' : 'border-transparent text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="card p-6 text-sm text-ink-muted">Loading…</div>
        ) : (
          <ul className="space-y-2">
            {list.map((t) => (
              <li key={t.id} className="card p-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink font-medium">{t.name}</span>
                    {t.is_default && <span className="text-2xs px-2 py-0.5 rounded-full bg-forest-soft text-forest-ink">Default</span>}
                  </div>
                  <div className="text-2xs text-ink-soft truncate mt-0.5">{firstLine(t.body)}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => setEditing(t)} className="btn-ghost text-2xs">Edit</button>
                  <button type="button" onClick={() => remove(t)} className="btn-ghost text-2xs text-claret hover:text-claret">Delete</button>
                </div>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="w-full p-4 border border-dashed border-rule rounded text-sm text-ink-muted hover:bg-forest/5 hover:border-forest hover:text-forest"
              >
                + New {KIND_LABELS[kind].slice(0, -1).toLowerCase()} template
              </button>
            </li>
          </ul>
        )}
      </div>

      {(creating || editing) && (
        <Editor
          template={editing}
          defaultKind={kind}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSave={save}
        />
      )}
    </Layout>
  );
}

function Editor({
  template, defaultKind, onClose, onSave,
}: {
  template: Template | null;
  defaultKind: Kind;
  onClose: () => void;
  onSave: (t: Partial<Template> & { id?: string }) => Promise<void>;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [bodyText, setBodyText] = useState(template?.body ?? '');
  const [isDefault, setIsDefault] = useState(template?.is_default ?? false);
  const [busy, setBusy] = useState(false);
  const kind: Kind = template?.kind ?? defaultKind;

  const sample = TEMPLATE_VARS_CATALOG[kind]?.sample ?? {};
  const preview = renderTemplate(bodyText, sample, { warn: false });

  async function submit() {
    setBusy(true);
    try {
      await onSave({ id: template?.id, kind, name, body: bodyText, is_default: isDefault });
    } finally { setBusy(false); }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] bg-ink/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-rule rounded-md w-full max-w-[680px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-4 border-b border-rule flex items-center justify-between">
          <h2 className="font-display text-lg">{template ? 'Edit template' : 'New template'}</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink-soft">✕</button>
        </header>
        <div className="p-5 space-y-4">
          <div>
            <label className="label">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" autoFocus />
          </div>
          <div>
            <label className="label">Body</label>
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={8}
              className="input font-mono text-xs"
              placeholder={`Hi {{parent.first_name}},\n\nQuick note from ${''}{{tutor.name}}…`}
            />
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-muted">Available variables</summary>
            <ul className="mt-2 grid grid-cols-2 gap-1 text-2xs">
              {Object.entries(TEMPLATE_VARS_CATALOG[kind]?.vars ?? {}).map(([k, v]) => (
                <li key={k}>
                  <code className="text-forest">{`{{${k}}}`}</code>: {v}
                </li>
              ))}
            </ul>
          </details>
          {bodyText && (
            <div>
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Preview with sample data</div>
              <div className="border border-rule rounded bg-ruleSoft/30 p-3 text-sm whitespace-pre-wrap text-ink">{preview || '–'}</div>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            <span>Set as default for {kind} templates</span>
          </label>
        </div>
        <footer className="px-5 py-4 border-t border-rule flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button type="button" onClick={submit} disabled={busy || !name.trim() || !bodyText.trim()} className="btn-primary text-sm">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function firstLine(s: string): string {
  return s.split('\n')[0]!.slice(0, 120);
}

export default function Page() {
  return <AuthGuard><Inner /></AuthGuard>;
}
