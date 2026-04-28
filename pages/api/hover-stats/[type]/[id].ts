import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../../lib/membership';

// GET /api/hover-stats/[type]/[id]
//
// Returns: { label, sublabel, stats: [{ label, value }], lastActivity, status }.
// Cached 60s in-process, keyed by (orgId, type, id).

type Stat = { label: string; value: string };

type CacheEntry = { at: number; data: any };
const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

const SUPPORTED = new Set(['student', 'parent', 'tutor', 'session', 'invoice', 'file', 'lesson_plan']);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const tok = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!tok) return res.status(401).json({ error: 'Not authenticated.' });
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${tok}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData } = await userClient.auth.getUser(tok);
  if (!userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const membership = await getMembershipForUser(userClient, userData.user.id);
  if (!membership) return res.status(403).json({ error: 'No org membership.' });

  const type = req.query.type as string;
  const id = req.query.id as string;
  if (!SUPPORTED.has(type) || !id) return res.status(400).json({ error: 'Unsupported type or missing id.' });

  const cacheKey = `${membership.organization_id}:${type}:${id}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < TTL_MS) return res.status(200).json(cached.data);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let result: any;
  switch (type) {
    case 'student':    result = await studentStats(admin, id, membership.organization_id); break;
    case 'parent':     result = await parentStats(admin, id, membership.organization_id); break;
    case 'tutor':      result = await tutorStats(admin, id, membership.organization_id); break;
    case 'session':    result = await sessionStats(admin, id, membership.organization_id); break;
    case 'invoice':    result = await invoiceStats(admin, id, membership.organization_id); break;
    case 'file':       result = await fileStats(admin, id, membership.organization_id); break;
    case 'lesson_plan': result = await lessonPlanStats(admin, id, membership.organization_id); break;
    default: return res.status(400).json({ error: 'Unsupported type.' });
  }
  if (!result) return res.status(404).json({ error: 'Not found.' });

  CACHE.set(cacheKey, { at: Date.now(), data: result });
  if (CACHE.size > 500) {
    // Trim oldest entries.
    const sorted = Array.from(CACHE.entries()).sort((a, b) => a[1].at - b[1].at);
    for (let i = 0; i < 100; i++) CACHE.delete(sorted[i]![0]);
  }

  return res.status(200).json(result);
}

const D30 = 30 * 86400_000;

async function studentStats(admin: SupabaseClient, id: string, orgId: string) {
  const { data: s } = await admin
    .from('students')
    .select('id, organization_id, name, year_level, parent_name, archived_at')
    .eq('id', id).maybeSingle();
  if (!s || s.organization_id !== orgId) return null;
  const since30 = new Date(Date.now() - D30).toISOString();
  const { count: count30 } = await admin
    .from('sessions').select('id', { count: 'exact', head: true })
    .eq('student_id', id).gte('scheduled_at', since30).is('deleted_at', null);
  const { data: lastSess } = await admin
    .from('sessions').select('scheduled_at')
    .eq('student_id', id).is('deleted_at', null)
    .order('scheduled_at', { ascending: false }).limit(1).maybeSingle();
  const { data: invs } = await admin
    .from('invoices').select('total_cents, status')
    .eq('student_id', id).neq('status', 'void').is('deleted_at', null);
  const balance = (invs ?? []).filter((i: any) => i.status !== 'paid').reduce((a: number, b: any) => a + (b.total_cents ?? 0), 0);

  const stats: Stat[] = [
    { label: 'Sessions, 30d', value: String(count30 ?? 0) },
    { label: 'Last session', value: lastSess?.scheduled_at ? formatRelative(lastSess.scheduled_at) : '—' },
    { label: 'Outstanding', value: formatCents(balance) },
    { label: 'Parent', value: s.parent_name ?? '—' },
  ];
  return {
    label: s.name,
    sublabel: s.year_level ?? null,
    stats,
    lastActivity: lastSess?.scheduled_at ?? null,
    status: s.archived_at ? 'archived' : 'active',
  };
}

async function parentStats(admin: SupabaseClient, id: string, orgId: string) {
  const { data: p } = await admin
    .from('parents').select('id, name, email, archived_at').eq('id', id).maybeSingle();
  if (!p) return null;
  // Verify org membership through parent_student_links.
  const { data: links } = await admin
    .from('parent_student_links').select('student:students(id, name, organization_id)')
    .eq('parent_id', id).is('revoked_at', null);
  const accessible = (links ?? []).filter((l: any) => l.student?.organization_id === orgId);
  if (accessible.length === 0) return null;
  const studentNames = accessible.map((l: any) => l.student?.name).filter(Boolean).join(', ');
  const studentIds = accessible.map((l: any) => l.student?.id).filter(Boolean);
  const { data: invs } = studentIds.length > 0 ? await admin
    .from('invoices').select('total_cents, status, issued_on')
    .in('student_id', studentIds).is('deleted_at', null).order('issued_on', { ascending: false }) : { data: [] };
  const balance = (invs ?? []).filter((i: any) => i.status !== 'paid' && i.status !== 'void')
    .reduce((a: number, b: any) => a + (b.total_cents ?? 0), 0);
  const lastInvoice = invs?.[0]?.issued_on ?? null;

  return {
    label: p.name ?? p.email,
    sublabel: p.email,
    stats: [
      { label: 'Students', value: String(accessible.length) },
      { label: 'Names', value: studentNames || '—' },
      { label: 'Outstanding', value: formatCents(balance) },
      { label: 'Last invoice', value: lastInvoice ? formatRelative(lastInvoice + 'T00:00:00Z') : '—' },
    ],
    lastActivity: lastInvoice,
    status: p.archived_at ? 'archived' : 'active',
  };
}

async function tutorStats(admin: SupabaseClient, id: string, orgId: string) {
  const { data: t } = await admin
    .from('tutors').select('id, name, organization_id, archived_at').eq('id', id).maybeSingle();
  if (!t || t.organization_id !== orgId) return null;
  const { count: studentCount } = await admin
    .from('students').select('id', { count: 'exact', head: true })
    .eq('primary_tutor_id', id).is('archived_at', null);
  const since30 = new Date(Date.now() - D30).toISOString();
  const { count: count30 } = await admin
    .from('sessions').select('id', { count: 'exact', head: true })
    .eq('tutor_id', id).gte('scheduled_at', since30).is('deleted_at', null);
  return {
    label: t.name,
    sublabel: 'Tutor',
    stats: [
      { label: 'Students', value: String(studentCount ?? 0) },
      { label: 'Sessions, 30d', value: String(count30 ?? 0) },
    ],
    lastActivity: null,
    status: t.archived_at ? 'archived' : 'active',
  };
}

async function sessionStats(admin: SupabaseClient, id: string, orgId: string) {
  const { data: s } = await admin
    .from('sessions')
    .select('id, organization_id, scheduled_at, duration_minutes, subject, status, notes_polished_by_ai, deleted_at, student:students(name), tutor:tutors(name)')
    .eq('id', id).maybeSingle();
  if (!s || (s as any).organization_id !== orgId) return null;
  return {
    label: `${(s as any).student?.name ?? 'Session'} · ${(s as any).subject ?? ''}`,
    sublabel: formatDateTime((s as any).scheduled_at),
    stats: [
      { label: 'Duration', value: `${(s as any).duration_minutes ?? 60} min` },
      { label: 'Status', value: (s as any).status },
      { label: 'Tutor', value: (s as any).tutor?.name ?? '—' },
      { label: 'Polished', value: (s as any).notes_polished_by_ai ? 'Yes' : 'No' },
    ],
    lastActivity: (s as any).scheduled_at,
    status: (s as any).deleted_at ? 'deleted' : (s as any).status,
  };
}

async function invoiceStats(admin: SupabaseClient, id: string, orgId: string) {
  const { data: i } = await admin
    .from('invoices')
    .select('id, organization_id, number, status, total_cents, issued_on, due_on, deleted_at')
    .eq('id', id).maybeSingle();
  if (!i || (i as any).organization_id !== orgId) return null;
  return {
    label: i.number,
    sublabel: formatDate(i.issued_on),
    stats: [
      { label: 'Status', value: i.status },
      { label: 'Amount', value: formatCents(i.total_cents) },
      { label: 'Due', value: i.due_on ? formatDate(i.due_on) : '—' },
    ],
    lastActivity: i.issued_on,
    status: (i as any).deleted_at ? 'deleted' : i.status,
  };
}

async function fileStats(admin: SupabaseClient, id: string, orgId: string) {
  const { data: f } = await admin
    .from('files').select('id, organization_id, display_name, original_filename, mime_type, file_size_bytes, created_at, deleted_at, archived_at')
    .eq('id', id).maybeSingle();
  if (!f || (f as any).organization_id !== orgId) return null;
  return {
    label: (f as any).display_name ?? f.original_filename,
    sublabel: f.mime_type,
    stats: [
      { label: 'Size', value: formatBytes(f.file_size_bytes) },
      { label: 'Uploaded', value: formatRelative(f.created_at) },
    ],
    lastActivity: f.created_at,
    status: (f as any).deleted_at ? 'deleted' : (f as any).archived_at ? 'archived' : 'active',
  };
}

async function lessonPlanStats(admin: SupabaseClient, id: string, orgId: string) {
  const { data: p } = await admin
    .from('lesson_plans').select('id, organization_id, subject, topic, year_level, duration_minutes, generated_by_ai, archived_at')
    .eq('id', id).maybeSingle();
  if (!p || (p as any).organization_id !== orgId) return null;
  return {
    label: p.topic,
    sublabel: p.subject,
    stats: [
      { label: 'Year', value: p.year_level ?? '—' },
      { label: 'Duration', value: `${p.duration_minutes ?? 60} min` },
      { label: 'AI', value: p.generated_by_ai ? 'Yes' : 'No' },
    ],
    lastActivity: null,
    status: (p as any).archived_at ? 'archived' : 'active',
  };
}

function formatRelative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (days < 0) {
    const ahead = -days;
    if (ahead < 1) return 'today';
    if (ahead === 1) return 'tomorrow';
    return `in ${ahead}d`;
  }
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatDate(iso: string): string {
  return new Date(iso.length <= 10 ? iso + 'T00:00:00Z' : iso)
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
function formatCents(c: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD',
    maximumFractionDigits: c % 100 === 0 ? 0 : 2 }).format(c / 100);
}
function formatBytes(bytes: number | null | undefined): string {
  const n = Number(bytes ?? 0);
  if (n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
