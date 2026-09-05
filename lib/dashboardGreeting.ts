// Greeting variations — picks one per session, keyed off date hash so the
// same user gets the same greeting throughout a single day. No randomness
// at render time; deterministic so the dashboard doesn't shuffle on
// re-mount within the same day.

const MORNING = [
  'Good morning, {{name}}.',
  'Morning, {{name}}.',
  'Hi {{name}}, quiet morning ahead?',
  'Welcome back, {{name}}.',
];

const AFTERNOON = [
  'Good afternoon, {{name}}.',
  'Afternoon, {{name}}.',
  'Hi {{name}}.',
  'Welcome back, {{name}}.',
];

const EVENING = [
  'Good evening, {{name}}.',
  'Evening, {{name}}.',
  'Hi {{name}}, ready to wrap up?',
  'Welcome back, {{name}}.',
];

function hashDateString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function pickGreeting(name: string | null | undefined, now: Date = new Date()): string {
  const hour = now.getHours();
  const pool = hour < 12 ? MORNING : hour < 17 ? AFTERNOON : EVENING;
  const seed = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const idx = hashDateString(seed) % pool.length;
  const template = pool[idx];
  if (!name) return template.replace(/, \{\{name\}\}/, '').replace('Hi {{name}}, ', 'Hi, ').replace('{{name}}', '');
  return template.replace('{{name}}', name);
}

// Compute consecutive-day streak from a sorted list of session dates (ISO).
// "Today's streak" = days back from today where at least one session existed.
export function computeStreak(sessionDates: string[], now: Date = new Date()): number {
  if (sessionDates.length === 0) return 0;
  const days = new Set<string>();
  for (const iso of sessionDates) {
    const d = new Date(iso);
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  let streak = 0;
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  while (true) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (!days.has(key)) {
      // Skip exactly today if no session yet — streak still alive from yesterday.
      if (streak === 0 && cursor.getTime() === new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    }
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
