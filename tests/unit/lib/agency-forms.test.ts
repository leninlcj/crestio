import { describe, expect, it } from 'vitest';
import { validateEnquiry, validateTutorApplication, normalisePhone, clientIp } from '../../../lib/agencyForms';

const goodEnquiry = {
  who: 'my_child',
  parent_name: 'Priya Nair',
  email: 'Priya@Example.com ',
  phone: '0412 345 678',
  student_first_name: 'Arjun',
  year_level: 'Year 11',
  subjects: ['maths_advanced', 'physics', 'maths_advanced', 'bogus'],
  mode: 'in_home',
  suburb: 'Hurstville',
  need: 'exam',
  message: 'Struggling with calculus.',
  source: 'google',
  page_path: '/enquire',
  website: '',
};

describe('validateEnquiry', () => {
  it('accepts a good enquiry and normalises it', () => {
    const r = validateEnquiry(goodEnquiry);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.email).toBe('priya@example.com');
    expect(r.value.subjects).toEqual(['maths_advanced', 'physics']);
    expect(r.value.phone).toBe('0412 345 678');
    expect(r.value.need).toBe('exam');
    expect(r.value.year_level).toBe('Year 11');
  });

  it('rejects the honeypot silently as a spam error', () => {
    const r = validateEnquiry({ ...goodEnquiry, website: 'http://spam' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.website).toBeTruthy();
  });

  it('requires a suburb for in-home or either', () => {
    const r = validateEnquiry({ ...goodEnquiry, mode: 'either', suburb: '' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.suburb).toBeTruthy();
    const online = validateEnquiry({ ...goodEnquiry, mode: 'online', suburb: '' });
    expect(online.ok).toBe(true);
  });

  it('collects every field error at once', () => {
    const r = validateEnquiry({ parent_name: 'A', email: 'nope', year_level: 'Year 13', subjects: [], phone: '12' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(['email', 'parent_name', 'phone', 'subjects', 'suburb', 'year_level']);
  });

  it('tolerates garbage input shapes', () => {
    expect(validateEnquiry(null).ok).toBe(false);
    expect(validateEnquiry('string').ok).toBe(false);
    expect(validateEnquiry({ subjects: 'maths_7_10' }).ok).toBe(false);
  });

  it('caps long fields', () => {
    const r = validateEnquiry({ ...goodEnquiry, message: 'x'.repeat(5000) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.message!.length).toBe(2000);
  });
});

const goodApplication = {
  full_name: 'Sam Lee',
  email: 'sam@example.com',
  phone: '+61 400 000 000',
  suburb: 'Kogarah',
  subjects: ['maths_ext1', 'physics'],
  qualifications: 'ATAR 97.2, Ext 1 94, Physics 91. 2nd year BEng.',
  wwcc_status: 'current',
  wwcc_number: 'wwc1234567e',
  abn: '12 345 678 901',
  mode: 'both',
  availability: 'Weekday afternoons',
  has_transport: true,
  experience: '',
  cv_url: 'linkedin.com/in/samlee',
  message: '',
  website: '',
};

describe('validateTutorApplication', () => {
  it('accepts and normalises a good application', () => {
    const r = validateTutorApplication(goodApplication);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.wwcc_number).toBe('WWC1234567E');
    expect(r.value.abn).toBe('12345678901');
    expect(r.value.cv_url).toBe('https://linkedin.com/in/samlee');
    expect(r.value.has_transport).toBe(true);
    expect(r.value.experience).toBeNull();
  });

  it('rejects a malformed WWCC number when status is current', () => {
    const r = validateTutorApplication({ ...goodApplication, wwcc_number: '12345' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.wwcc_number).toBeTruthy();
  });

  it('rejects a short ABN and a bad phone', () => {
    const r = validateTutorApplication({ ...goodApplication, abn: '123', phone: '1234' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.abn).toBeTruthy();
    expect(r.errors.phone).toBeTruthy();
  });

  it('requires the core fields', () => {
    const r = validateTutorApplication({});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(['email', 'full_name', 'mode', 'phone', 'qualifications', 'subjects', 'suburb', 'wwcc_status']);
  });
});

describe('helpers', () => {
  it('normalisePhone accepts AU formats and rejects short strings', () => {
    expect(normalisePhone('0412 345 678')).toBe('0412 345 678');
    expect(normalisePhone('(02) 9555 1234')).toBe('(02) 9555 1234');
    expect(normalisePhone('123')).toBeNull();
    expect(normalisePhone('')).toBeNull();
  });
  it('clientIp reads the first forwarded address', () => {
    expect(clientIp({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })).toBe('1.2.3.4');
    expect(clientIp({}, '9.9.9.9')).toBe('9.9.9.9');
  });
});
