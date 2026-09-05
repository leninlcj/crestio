import { describe, it, expect } from 'vitest';
import { SUBURBS, suburbBySlug, neighboursOf, suburbsInRegion, REGIONS, listNames } from '../../../lib/suburbs';
import { buildEnquiryFollowupEmail } from '../../../lib/emails/agency';
import { ENQUIRY_COPY_ES, ENQUIRY_COPY_EN } from '../../../lib/enquiryCopy';
import { SUBJECTS, NEEDS } from '../../../lib/agency';

describe('suburb data', () => {
  it('has unique slugs and names, and every neighbour resolves', () => {
    const slugs = SUBURBS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const names = SUBURBS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const s of SUBURBS) {
      expect(s.slug, s.name).toMatch(/^[a-z0-9-]+$/);
      for (const n of s.neighbours) expect(suburbBySlug(n), `${s.name} -> ${n}`).toBeTruthy();
      expect(s.neighbours).not.toContain(s.slug);
    }
  });

  it('every suburb belongs to a listed region', () => {
    const covered = REGIONS.flatMap((r) => suburbsInRegion(r).map((s) => s.slug));
    expect(covered.sort()).toEqual(SUBURBS.map((s) => s.slug).sort());
  });

  it('neighbour lists read naturally', () => {
    const h = suburbBySlug('hurstville')!;
    const text = listNames(neighboursOf(h));
    expect(text).toContain(' and ');
    expect(text).not.toContain('—');
    expect(listNames([{ name: 'Oatley' }])).toBe('Oatley');
  });
});

describe('enquiry follow-up emails', () => {
  const base = { parentName: "Priya O'Neil", studentFirstName: 'Arjun', subjects: ['maths_advanced', 'physics'], createdAt: '2026-09-01T02:00:00.000Z' };

  it('day-3 English follow-up names the student and subjects and invites a reply', () => {
    const e = buildEnquiryFollowupEmail({ ...base, step: 1, lang: 'en' });
    expect(e.subject).toContain('Arjun');
    expect(e.html).toContain('Maths Advanced, Physics');
    expect(e.text).toContain("Lenin here from Crestio Tutoring");
    expect(e.text).not.toContain('&#39;');
    expect(e.text).not.toContain('—');
    expect(e.html).toContain('/enquire');
  });

  it('day-10 English follow-up closes politely and has no button', () => {
    const e = buildEnquiryFollowupEmail({ ...base, step: 2, lang: 'en' });
    expect(e.subject).toMatch(/Closing your enquiry/);
    expect(e.html).not.toContain('Pick up where you left off');
    expect(e.text).toContain('Good luck to Arjun');
  });

  it('Spanish follow-ups keep their accents in the plaintext part', () => {
    const e = buildEnquiryFollowupEmail({ ...base, step: 1, lang: 'es' });
    expect(e.subject).toContain('¿Sigues buscando tutor para Arjun?');
    expect(e.text).toContain('todavía');
    expect(e.html).toContain('/es#consulta');
    const e2 = buildEnquiryFollowupEmail({ ...base, step: 2, lang: 'es' });
    expect(e2.text).toContain('Mucha suerte a Arjun');
  });

  it('falls back when no student name was given', () => {
    const e = buildEnquiryFollowupEmail({ ...base, studentFirstName: null, step: 1, lang: 'en' });
    expect(e.subject).toContain('your student');
  });
});

describe('Spanish enquiry copy', () => {
  it('translates every subject and goal key', () => {
    for (const s of SUBJECTS) expect(ENQUIRY_COPY_ES.subjects.labels[s.key], s.key).toBeTruthy();
    for (const n of NEEDS) expect(ENQUIRY_COPY_ES.focus.labels[n.key], n.key).toBeTruthy();
    expect(ENQUIRY_COPY_ES.steps).toHaveLength(6);
    expect(ENQUIRY_COPY_EN.steps).toHaveLength(6);
  });

  it('keeps the privacy link text inside the consent sentence', () => {
    for (const c of [ENQUIRY_COPY_EN, ENQUIRY_COPY_ES]) expect(c.contact.consent).toContain(c.contact.privacyLink);
  });
});
