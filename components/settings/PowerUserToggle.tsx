import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Props = { initialValue?: boolean };

export default function PowerUserToggle({ initialValue = false }: Props) {
  const [enabled, setEnabled] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('profiles')
        .select('power_user_mode')
        .eq('id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data?.power_user_mode != null) {
        setEnabled(!!data.power_user_mode);
        applyDocumentClass(!!data.power_user_mode);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    applyDocumentClass(next);
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase
          .from('profiles')
          .update({ power_user_mode: next })
          .eq('id', session.user.id);
        setSavedAt(Date.now());
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start gap-4 py-4 border-t border-rule">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-ink mb-1">Power user mode</div>
        <p className="text-2xs text-ink-muted leading-relaxed max-w-prose">
          Tighter row spacing, smaller type, more keyboard shortcuts visible, two-decimal currency. For tutors who live inside the app.
        </p>
        {saving && <div className="text-2xs text-ink-soft mt-1">Saving…</div>}
        {!saving && savedAt && Date.now() - savedAt < 2000 && (
          <div className="text-2xs text-forest mt-1">Saved · refresh to see changes everywhere</div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        className={[
          'shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
          enabled ? 'bg-forest' : 'bg-rule',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-4 w-4 transform rounded-full bg-cream transition-transform',
            enabled ? 'translate-x-6' : 'translate-x-1',
          ].join(' ')}
        />
      </button>
    </div>
  );
}

function applyDocumentClass(enabled: boolean) {
  if (typeof document === 'undefined') return;
  if (enabled) document.documentElement.classList.add('crestio-power-user');
  else document.documentElement.classList.remove('crestio-power-user');
}
