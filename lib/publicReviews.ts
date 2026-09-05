import { createClient } from '@supabase/supabase-js';
import { getAgencyOrganization } from './agencyOrg';
import { listPublicReviews } from './reviews';
import type { ReviewCard } from '../components/agency/blocks';

// Server-side only (getStaticProps). Returns [] whenever the database is not
// reachable (CI builds, a missing table, an outage) so the site still builds
// and simply shows the "no reviews yet" band.
export async function loadPublicReviews(limit = 8): Promise<ReviewCard[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return [];
  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const org = await getAgencyOrganization(admin);
    if (!org) return [];
    const rows = await listPublicReviews(admin, org.id, limit);
    return rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      reviewer_name: r.reviewer_name,
      reviewer_suburb: r.reviewer_suburb,
      student_year_level: r.student_year_level,
      subject: r.subject,
    }));
  } catch (e: any) {
    console.warn('[publicReviews] unavailable:', e?.message ?? e);
    return [];
  }
}
