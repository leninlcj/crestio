export type UUID = string;

export interface Profile {
  id: UUID;
  business_name: string | null;
  owner_name: string | null;
  email: string | null;
  phone: string | null;
  default_rate_cents: number;
  currency: string;
  onboarded: boolean;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: UUID;
  owner_id: UUID;
  name: string;
  year_level: string | null;
  school: string | null;
  subjects: string[];
  parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  hourly_rate_cents: number | null;
  notes: string | null;
  archived: boolean;
  household_id: UUID | null;
  created_at: string;
  updated_at: string;
}

export interface Household {
  id: UUID;
  organization_id: UUID;
  display_name: string;
  billing_email: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HouseholdParent {
  id: UUID;
  household_id: UUID;
  parent_id: UUID;
  is_primary: boolean;
  added_at: string;
}

export interface Tutor {
  id: UUID;
  owner_id: UUID;
  organization_id: UUID;
  auth_user_id: UUID | null;
  name: string;
  email: string | null;
  phone: string | null;
  subjects: string[];
  pay_rate_cents: number | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export type SessionStatus =
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled'
  | 'pending_change';

export interface Session {
  id: UUID;
  owner_id: UUID;
  student_id: UUID;
  tutor_id: UUID | null;
  subject: string | null;
  topic: string | null;
  scheduled_at: string;
  duration_minutes: number;
  charge_rate_cents: number | null;
  pay_rate_cents: number | null;
  status: SessionStatus;
  homework: string | null;
  homework_description: string | null;
  homework_due_date: string | null;
  homework_completed_at: string | null;
  homework_completed_by_user_id: UUID | null;
  next_session_focus: string | null;
  notes_internal: string | null;
  notes_parent_facing: string | null;
  parent_notified_at: string | null;
  invoice_id: UUID | null;
  paid: boolean;
  created_at: string;
  updated_at: string;
}

export interface Parent {
  id: UUID;
  auth_user_id: UUID;
  email: string;
  name: string | null;
  notifications_enabled: boolean;
  created_at: string;
}

export interface ParentStudentLink {
  id: UUID;
  parent_id: UUID;
  student_id: UUID;
  tutor_user_id: UUID;
  revoked_at: string | null;
  created_at: string;
}

export interface ParentInvitation {
  id: UUID;
  token: string;
  email: string;
  student_id: UUID;
  tutor_user_id: UUID;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';

export interface Invoice {
  id: UUID;
  owner_id: UUID;
  student_id: UUID | null;
  household_id: UUID | null;
  number: string;
  issued_on: string;
  due_on: string | null;
  subtotal_cents: number;
  total_cents: number;
  status: InvoiceStatus;
  notes: string | null;
  sent_at: string | null;
  paid_at: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  is_batch_generated: boolean;
  created_at: string;
  updated_at: string;
}

export interface InvoiceSession {
  id: UUID;
  invoice_id: UUID;
  session_id: UUID;
  student_id: UUID;
  hourly_rate_cents: number;
  duration_minutes: number;
  amount_cents: number;
  line_item_description: string;
  created_at: string;
}

export interface LessonPlan {
  id: UUID;
  owner_id: UUID;
  student_id: UUID | null;
  subject: string;
  topic: string;
  year_level: string | null;
  duration_minutes: number;
  content: string;
  generated_by_ai: boolean;
  created_at: string;
  updated_at: string;
}

export type FileStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export interface FileRow {
  id: UUID;
  organization_id: UUID;
  uploaded_by_user_id: UUID | null;
  student_id: UUID | null;
  session_id: UUID | null;
  storage_path: string;
  original_filename: string;
  display_name: string;
  mime_type: string;
  file_size_bytes: number;
  is_org_library: boolean;
  status: FileStatus;
  converted_pdf_path: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FileView {
  id: UUID;
  file_id: UUID;
  viewer_user_id: UUID;
  viewer_role: 'student' | 'parent' | 'tutor' | 'owner';
  viewed_at: string;
  ip_address: string | null;
  user_agent: string | null;
}
