import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode,
} from 'react';
import { supabase } from './supabase';
import {
  initI18n, setActiveLocale, isSupportedLocale, SupportedLocale, detectBrowserLocale,
} from './i18n';

type Ctx = {
  locale: SupportedLocale;
  setLocale: (l: SupportedLocale) => Promise<void>;
  isReady: boolean;
};

const LocaleContext = createContext<Ctx>({
  locale: 'en',
  setLocale: async () => { /* noop */ },
  isReady: false,
});

export function useLocale(): Ctx {
  return useContext(LocaleContext);
}

// Resolves the user's locale in this order:
//   1. profiles.locale (if signed in as tutor/owner)
//   2. parents.locale (if signed in as parent)
//   3. localStorage cached value
//   4. navigator.language (first supported)
//   5. 'en'
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>('en');
  const [isReady, setReady] = useState(false);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    initI18n();

    (async () => {
      let resolved: SupportedLocale = detectBrowserLocale();
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: profile } = await supabase
            .from('profiles').select('locale').eq('id', session.user.id).maybeSingle();
          if (profile?.locale && isSupportedLocale(profile.locale)) {
            resolved = profile.locale;
          } else {
            // Parent might have locale on the parents row instead.
            const { data: parent } = await supabase
              .from('parents').select('locale').eq('auth_user_id', session.user.id).maybeSingle();
            if (parent?.locale && isSupportedLocale(parent.locale)) resolved = parent.locale;
          }
        }
      } catch { /* ignore */ }
      setActiveLocale(resolved);
      setLocaleState(resolved);
      setReady(true);
    })();
  }, []);

  const setLocale = useCallback(async (next: SupportedLocale) => {
    setActiveLocale(next);
    setLocaleState(next);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      // Write to both tables — cheap, and one of the two is a no-op.
      await Promise.all([
        supabase.from('profiles').update({ locale: next }).eq('id', session.user.id),
        supabase.from('parents').update({ locale: next }).eq('auth_user_id', session.user.id),
      ]);
    } catch { /* ignore */ }
  }, []);

  const value = useMemo<Ctx>(() => ({ locale, setLocale, isReady }), [locale, setLocale, isReady]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
