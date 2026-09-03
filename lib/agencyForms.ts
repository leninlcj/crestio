// Validation for the two public forms: family enquiries and tutor
// applications. Pure functions so they are unit-tested and shared between
// the API routes and (where useful) the client.

import {
  ENQUIRY_MODES,
  NEEDS,
  SUBJECT_KEYS,
  TUTOR_MODES,
  WWCC_STATUSES,
  YEAR_LEVELS,
  type EnquiryMode,
  type NeedKey,
  type SubjectKey,
  type TutorMode,
  type WwccStatus,
} from './agency';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Australian mobile/landline, loosely: digits, spaces, +, (), - ; 8–15 digits.
export function normalisePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d+]/g, '');
  const count = digits.replace(/\D/g, '').length;
  if (count < 8 || count > 15) return null;
  return trimmed.slice(0, 32);
}

type Str = (v: unknown, max: number) => string;
const str: Str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

function subjectList(v: unknown): SubjectKey[] {
  if (!Array.isArray(v)) return [];
  const out: SubjectKey[] = [];
  for (const item of v) {
    if (typeof item === 'string' && (SUBJECT_KEYS as string[]).includes(item) && !out.includes(item as SubjectKey)) {
      out.push(item as SubjectKey);
    }
  }
  return out;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

// ---------------------------------------------------------------------------
// Enquiry
// ---------------------------------------------------------------------------

export type EnquiryInput = {
  who: 'my_child' | 'me' | 'someone_else';
  parent_name: string;
  email: string;
  phone: string | null;
  student_first_name: string | null;
  year_level: (typeof YEAR_LEVELS)[number];
  subjects: SubjectKey[];
  mode: EnquiryMode;
  suburb: string | null;
  need: NeedKey | null;
  message: string | null;
  source: string | null;
  page_path: string | null;
};

const WHO = ['my_child', 'me', 'someone_else'] as const;

export function validateEnquiry(body: unknown): ValidationResult<EnquiryInput> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  // Honeypot: real browsers leave it empty; bots fill it.
  if (str(b.website, 200)) {
    return { ok: false, errors: { website: 'Spam check failed.' } };
  }

  const who = oneOf(b.who, WHO) ?? 'my_child';
  const parent_name = str(b.parent_name, 120);
  if (parent_name.length < 2) errors.parent_name = 'Enter your name.';

  const email = str(b.email, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';

  const rawPhone = str(b.phone, 40);
  const phone = rawPhone ? normalisePhone(rawPhone) : null;
  if (rawPhone && !phone) errors.phone = 'Enter a valid phone number.';

  const year_level = oneOf(b.year_level, YEAR_LEVELS);
  if (!year_level) errors.year_level = 'Choose a year level.';

  const subjects = subjectList(b.subjects);
  if (subjects.length === 0) errors.subjects = 'Choose at least one subject.';

  const mode = oneOf(b.mode, ENQUIRY_MODES.map((m) => m.key)) ?? 'either';
  const suburb = str(b.suburb, 80) || null;
  if (mode !== 'online' && !suburb) errors.suburb = 'Tell us the suburb for in-home lessons.';

  const need = oneOf(b.need, NEEDS.map((n) => n.key));
  const message = str(b.message, 2000) || null;
  const student_first_name = str(b.student_first_name, 60) || null;
  const source = str(b.source, 120) || null;
  const page_path = str(b.page_path, 200) || null;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      who,
      parent_name,
      email,
      phone,
      student_first_name,
      year_level: year_level!,
      subjects,
      mode,
      suburb,
      need,
      message,
      source,
      page_path,
    },
  };
}

// ---------------------------------------------------------------------------
// Tutor application
// ---------------------------------------------------------------------------

export type TutorApplicationInput = {
  full_name: string;
  email: string;
  phone: string;
  suburb: string;
  subjects: SubjectKey[];
  qualifications: string;
  wwcc_status: WwccStatus;
  wwcc_number: string | null;
  abn: string | null;
  mode: TutorMode;
  availability: string | null;
  has_transport: boolean | null;
  experience: string | null;
  cv_url: string | null;
  message: string | null;
  source: string | null;
  page_path: string | null;
};

export function validateTutorApplication(body: unknown): ValidationResult<TutorApplicationInput> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  if (str(b.website, 200)) {
    return { ok: false, errors: { website: 'Spam check failed.' } };
  }

  const full_name = str(b.full_name, 120);
  if (full_name.length < 2) errors.full_name = 'Enter your full name.';

  const email = str(b.email, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';

  const rawPhone = str(b.phone, 40);
  const phone = rawPhone ? normalisePhone(rawPhone) : null;
  if (!phone) errors.phone = 'Enter a valid phone number.';

  const suburb = str(b.suburb, 80);
  if (!suburb) errors.suburb = 'Enter your suburb.';

  const subjects = subjectList(b.subjects);
  if (subjects.length === 0) errors.subjects = 'Choose at least one subject you can tutor.';

  const qualifications = str(b.qualifications, 600);
  if (qualifications.length < 3) errors.qualifications = 'Tell us your ATAR, HSC results or university course.';

  const wwcc_status = oneOf(b.wwcc_status, WWCC_STATUSES.map((w) => w.key));
  if (!wwcc_status) errors.wwcc_status = 'Tell us about your Working With Children Check.';

  const wwcc_number = str(b.wwcc_number, 40) || null;
  if (wwcc_status === 'current' && wwcc_number && !/^WWC\d{7}[A-Z]$/i.test(wwcc_number.replace(/\s+/g, ''))) {
    errors.wwcc_number = 'A NSW WWCC number looks like WWC1234567E.';
  }

  const abn = str(b.abn, 20) || null;
  if (abn && abn.replace(/\D/g, '').length !== 11) errors.abn = 'An ABN has 11 digits.';

  const mode = oneOf(b.mode, TUTOR_MODES.map((m) => m.key));
  if (!mode) errors.mode = 'Choose online, in-home or both.';

  const availability = str(b.availability, 600) || null;
  const has_transport = typeof b.has_transport === 'boolean' ? b.has_transport : null;
  const experience = str(b.experience, 2000) || null;

  const rawCv = str(b.cv_url, 400);
  let cv_url: string | null = null;
  if (rawCv) {
    try {
      const u = new URL(rawCv.startsWith('http') ? rawCv : `https://${rawCv}`);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('bad protocol');
      cv_url = u.toString();
    } catch {
      errors.cv_url = 'Enter a link (Google Drive, LinkedIn, Dropbox) or leave it blank.';
    }
  }

  const message = str(b.message, 2000) || null;
  const source = str(b.source, 120) || null;
  const page_path = str(b.page_path, 200) || null;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      full_name,
      email,
      phone: phone!,
      suburb,
      subjects,
      qualifications,
      wwcc_status: wwcc_status!,
      wwcc_number: wwcc_number ? wwcc_number.replace(/\s+/g, '').toUpperCase() : null,
      abn: abn ? abn.replace(/\D/g, '') : null,
      mode: mode!,
      availability,
      has_transport,
      experience,
      cv_url,
      message,
      source,
      page_path,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers shared by the public API routes.
// ---------------------------------------------------------------------------

export function clientIp(headers: Record<string, string | string[] | undefined>, fallback = 'unknown'): string {
  const fwd = headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  const ip = (first ?? '').split(',')[0]?.trim();
  return ip || fallback;
}
