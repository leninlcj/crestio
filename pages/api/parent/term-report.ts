import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { renderTermReportPdf } from '../../../lib/pdf/term-report';

// GET /api/parent/term-report?student_id=...&term=2026-T2[&download=1]
//
// term format: YYYY-T1|T2|T3|T4 (Australian school terms; rough quarter
// boundaries). Or YYYY-Q1|Q2|Q3|Q4.
//
// Returns the PDF as a stream. If a row exists in term_reports for the
// (org, student, term) we return the cached file from Storage. Otherwise
// we generate, upload, and insert.
//
// Authorization: parent of the student OR member of the student's org.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const studentId = parseQ(req.query.student_id);
  const termParam = parseQ(req.query.term);
  if (!studentId || !termParam) return res.status(400).json({ error: 'student_id and term required' });

  const term = parseTerm(termParam);
  if (!term) return res.status(400).json({ error: 'Invalid term. Use YYYY-T1, YYYY-T2, YYYY-T3, or YYYY-T4.' });

  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Fetch student + org. Authorize by membership OR parent link.
  const { data: student } = await admin
    .from('students')
    .select('id, name, organization_id')
    .eq('id', studentId)
    .maybeSingle();
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const orgId = (student as any).organization_id as string;
  const authorized = await isAuthorized(admin, userData.user.id, orgId, studentId);
  if (!authorized) return res.status(403).json({ error: 'Not authorized for this student' });

  // Fetch org + tutor for branding.
  const { data: org } = await admin
    .from('organizations')
    .select('id, name, brand_color, owner_user_id')
    .eq('id', orgId)
    .maybeSingle();
  let tutorName: string | null = null;
  if ((org as any)?.owner_user_id) {
    const { data: tutorProfile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', (org as any).owner_user_id)
      .maybeSingle();
    tutorName = (tutorProfile as any)?.full_name ?? null;
  }

  // Fetch sessions in the term window.
  const { data: sessions } = await admin
    .from('sessions')
    .select('scheduled_at, duration_minutes, subject, status, notes_parent_facing')
    .eq('student_id', studentId)
    .gte('scheduled_at', term.start)
    .lt('scheduled_at', term.endExclusive)
    .order('scheduled_at', { ascending: true });

  const completed = (sessions ?? []).filter((s: any) => s.status === 'completed');
  const totalSessions = (sessions ?? []).length;
  const totalMin = completed.reduce((acc: number, s: any) => acc + (s.duration_minutes ?? 0), 0);
  const attendancePct = totalSessions > 0 ? (completed.length / totalSessions) * 100 : 0;

  const pdfBytes = await renderTermReportPdf({
    org: {
      name: (org as any)?.name ?? 'Tutoring',
      color: (org as any)?.brand_color ?? null,
      tutorName,
    },
    student_name: (student as any).name,
    term_label: term.label,
    term_start: term.start.slice(0, 10),
    term_end: shiftDate(term.endExclusive, -1),
    total_sessions: completed.length,
    total_hours: Math.round(totalMin / 60 * 10) / 10,
    attendance_rate_pct: attendancePct,
    tutor_comment: null,
    sessions: completed.map((s: any) => ({
      date: s.scheduled_at.slice(0, 10),
      subject: s.subject,
      duration_minutes: s.duration_minutes,
      polished_notes: s.notes_parent_facing,
    })),
  });

  // Upload + index.
  try {
    const path = `term-reports/${orgId}/${studentId}/${termParam}.pdf`;
    await admin.storage.from('files').upload(path, pdfBytes, {
      contentType: 'application/pdf', upsert: true,
    });
    await admin.from('term_reports').upsert({
      organization_id: orgId,
      student_id: studentId,
      term_start: term.start.slice(0, 10),
      term_end: shiftDate(term.endExclusive, -1),
      pdf_path: path,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,student_id,term_start' });
  } catch {
    // Non-fatal — we'll still return the PDF inline.
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'private, max-age=300');
  const filename = `${(student as any).name.replace(/\s+/g, '-')}-${term.label.replace(/\s+/g, '-')}.pdf`;
  if (parseQ(req.query.download)) {
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  } else {
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  }
  res.status(200).send(Buffer.from(pdfBytes));
}

async function isAuthorized(admin: any, userId: string, orgId: string, studentId: string): Promise<boolean> {
  const { data: m } = await admin
    .from('memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (m) return true;
  const { data: parent } = await admin
    .from('parents')
    .select('id')
    .eq('auth_user_id', userId)
    .maybeSingle();
  if (!parent) return false;
  const { data: link } = await admin
    .from('parent_student_links')
    .select('id')
    .eq('parent_id', (parent as any).id)
    .eq('student_id', studentId)
    .is('revoked_at', null)
    .maybeSingle();
  return !!link;
}

function parseQ(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
}

function parseTerm(s: string): { label: string; start: string; endExclusive: string } | null {
  const m = s.match(/^(\d{4})-(?:T|Q)([1-4])$/i);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const q = parseInt(m[2], 10);
  // Aussie terms: T1 Feb-Apr, T2 May-Jul, T3 Aug-Oct, T4 Oct-Dec.
  const ranges: Record<number, [number, number]> = {
    1: [1, 4],
    2: [4, 7],
    3: [7, 10],
    4: [10, 13],
  };
  const [m0, m1] = ranges[q];
  const start = new Date(year, m0 - 1, 1);
  const endExclusive = new Date(year + (m1 > 12 ? 1 : 0), (m1 - 1) % 12, 1);
  return {
    label: `Term ${q} · ${year}`,
    start: start.toISOString(),
    endExclusive: endExclusive.toISOString(),
  };
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
