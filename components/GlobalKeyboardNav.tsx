import { useRouter } from 'next/router';
import { useKeyboard } from '../lib/useKeyboard';

// Wires the global G-prefix navigation shortcuts. Mounted once from _app.tsx.
// Skill goes into lib/keyboard.ts → here we only translate id → action.
export default function GlobalKeyboardNav() {
  const router = useRouter();
  useKeyboard('goHome',      () => router.push('/app'));
  useKeyboard('goSessions',  () => router.push('/app/sessions'));
  useKeyboard('goPeople',    () => router.push('/app/students'));
  useKeyboard('goMoney',     () => router.push('/app/invoices'));
  useKeyboard('goResources', () => router.push('/app/lesson-plans'));
  useKeyboard('goTeam',      () => router.push('/app/tutors'));
  useKeyboard('goNew',       () => router.push('/app/sessions/new'));
  useKeyboard('newSession',  () => router.push('/app/sessions/new'));
  useKeyboard('inlineCompose', () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('crestio:open-inline-composer'));
  });
  return null;
}
