export type ThreadSummary = {
  id: string;
  student_id: string;
  student_name: string;
  parent_id: string;
  parent_name: string | null;
  parent_email: string | null;
  tutor_user_id: string;
  tutor_name: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  archived: boolean;
  unread_count: number;
  has_urgent_unread: boolean;
};

export type ThreadDetail = {
  id: string;
  student_id: string;
  student_name: string;
  parent_id: string;
  parent_name: string | null;
  parent_email: string | null;
  tutor_user_id: string;
  tutor_name: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  archived: boolean;
};

export type Message = {
  id: string;
  sender_type: 'tutor' | 'parent';
  sender_user_id: string;
  body: string;
  deleted: boolean;
  urgency: 'urgent' | 'normal' | 'info' | null;
  created_at: string;
  edited_at: string | null;
};

export type Viewer = 'tutor' | 'parent';
