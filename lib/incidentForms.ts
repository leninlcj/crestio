import { EMAIL_RE, normalisePhone } from './agencyForms';

export const INCIDENT_CATEGORIES = [
  { key: 'safety', label: 'A safety concern about a student' },
  { key: 'conduct', label: "A tutor's conduct" },
  { key: 'complaint', label: 'A complaint about lessons or service' },
  { key: 'injury', label: 'An injury or accident during a lesson' },
  { key: 'property', label: 'Damage or loss of property' },
  { key: 'other', label: 'Something else' },
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number]['key'];

export type IncidentInput = {
  reporter_name: string;
  reporter_email: string;
  reporter_phone: string | null;
  reporter_role: 'parent' | 'tutor' | 'student' | 'public';
  category: IncidentCategory;
  occurred_at: string | null;
  who: string | null;
  description: string;
};

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function validateIncident(body: unknown): { ok: true; value: IncidentInput } | { ok: false; errors: Record<string, string> } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  if (str(b.website, 200)) return { ok: false, errors: { website: 'Spam check failed.' } };

  const reporter_name = str(b.reporter_name, 120);
  if (reporter_name.length < 2) errors.reporter_name = 'Enter your name.';
  const reporter_email = str(b.reporter_email, 200).toLowerCase();
  if (!EMAIL_RE.test(reporter_email)) errors.reporter_email = 'Enter a valid email address so we can reply.';
  const rawPhone = str(b.reporter_phone, 40);
  const reporter_phone = rawPhone ? normalisePhone(rawPhone) : null;
  if (rawPhone && !reporter_phone) errors.reporter_phone = 'Enter a valid phone number.';
  const roles = ['parent', 'tutor', 'student', 'public'] as const;
  const reporter_role = roles.includes(b.reporter_role as any) ? (b.reporter_role as IncidentInput['reporter_role']) : 'public';
  const keys = INCIDENT_CATEGORIES.map((c) => c.key) as string[];
  const category = keys.includes(b.category as string) ? (b.category as IncidentCategory) : null;
  if (!category) errors.category = 'Choose what this is about.';
  let occurred_at: string | null = null;
  const rawWhen = str(b.occurred_at, 40);
  if (rawWhen) {
    const d = new Date(rawWhen);
    if (Number.isNaN(d.getTime())) errors.occurred_at = 'Enter a valid date.';
    else occurred_at = d.toISOString();
  }
  const who = str(b.who, 200) || null;
  const description = str(b.description, 5000);
  if (description.length < 10) errors.description = 'Tell us what happened.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { reporter_name, reporter_email, reporter_phone, reporter_role, category: category!, occurred_at, who, description } };
}
