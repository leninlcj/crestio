// Reviews: real families, their own words, shown only after the owner approves.
//
// Flow: the daily cron finds households that have had REVIEWS.askAfterLessons
// completed lessons and no request yet, creates a reviews row with a token and
// emails the primary parent a link to /review/[token]. One reminder after
// REVIEWS.reminderAfterDays, then nothing. The family writes the review on
// that page; the owner approves or hides it under Leads > Reviews; the home
// page shows approved reviews only. Nothing is ever written by us.

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { REVIEWS } from './agency';
import { isMissingTableError } from './dbErrors';

type Admin = SupabaseClient<any, any, any>;

export {
  REVIEW_COPY, REVIEW_TOKEN_RE, validateReviewSubmission,
  type ReviewLang, type ReviewStatus, type ReviewRow, type PublicReview, type ReviewSubmission,
} from './reviewCopy';
import { REVIEW_TOKEN_RE, type ReviewLang, type ReviewRow, type PublicReview } from './reviewCopy';

export function newReviewToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

// ---------------------------------------------------------------------------
// Who is due a review request. Pure so it can be unit-tested; the cron feeds it.
// ---------------------------------------------------------------------------

export type HouseholdLessonFacts = {
  household_id: string;
  completed_lessons: number;
  first_lesson_at: string | null;   // ISO of the earliest completed lesson
  last_lesson_at: string | null;
  has_open_request: boolean;        // any review row in the last 365 days
};

export function isDueReviewRequest(f: HouseholdLessonFacts, now: Date = new Date()): boolean {
  if (f.has_open_request) return false;
  if (f.completed_lessons < REVIEWS.askAfterLessons) return false;
  if (!f.first_lesson_at) return false;
  const days = (now.getTime() - new Date(f.first_lesson_at).getTime()) / 86_400_000;
  if (days < REVIEWS.minDaysSinceFirstLesson) return false;
  // Do not ask a family whose last lesson was more than 90 days ago: they have stopped.
  if (f.last_lesson_at && (now.getTime() - new Date(f.last_lesson_at).getTime()) / 86_400_000 > 90) return false;
  return true;
}

export function isDueReviewReminder(r: Pick<ReviewRow, 'status' | 'requested_at' | 'reminded_at'>, now: Date = new Date()): boolean {
  if (r.status !== 'requested' || !r.requested_at || r.reminded_at) return false;
  const days = (now.getTime() - new Date(r.requested_at).getTime()) / 86_400_000;
  return days >= REVIEWS.reminderAfterDays && days < 60;
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

export async function getReviewByToken(admin: Admin, token: string): Promise<ReviewRow | null> {
  if (!REVIEW_TOKEN_RE.test(token)) return null;
  const { data, error } = await admin
    .from('reviews')
    .select('id, household_id, student_id, tutor_id, parent_email, token, language, source, created_at, requested_at, reminded_at, submitted_at, rating, body, reviewer_name, reviewer_suburb, consent_public, status, approved_at')
    .eq('token', token)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return null;
    throw new Error(error.message);
  }
  return (data as ReviewRow | null) ?? null;
}

/** Approved reviews for the public site, newest first. Empty when the table is missing. */
export async function listPublicReviews(admin: Admin, organizationId: string, limit = 12): Promise<PublicReview[]> {
  const { data, error } = await admin
    .from('reviews')
    .select('id, rating, body, reviewer_name, reviewer_suburb, approved_at, student:students(year_level, subjects)')
    .eq('organization_id', organizationId)
    .eq('status', 'approved')
    .eq('consent_public', true)
    .not('body', 'is', null)
    .not('reviewer_name', 'is', null)
    .order('approved_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as any[]).map((r) => {
    const student = Array.isArray(r.student) ? r.student[0] : r.student;
    return {
      id: r.id,
      rating: r.rating,
      body: r.body,
      reviewer_name: r.reviewer_name,
      reviewer_suburb: r.reviewer_suburb ?? null,
      student_year_level: student?.year_level ?? null,
      subject: Array.isArray(student?.subjects) && student.subjects.length > 0 ? String(student.subjects[0]) : null,
      approved_at: r.approved_at,
    } as PublicReview;
  }).filter((r) => r.rating && r.body && r.reviewer_name);
}
