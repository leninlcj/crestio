// Shared types between the WeekCalendar component and the pages using it.

export type CalendarSession = {
  id: string;
  student_id: string;
  student_name: string;
  subject: string | null;
  scheduled_at: string; // ISO
  duration_minutes: number;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled' | 'pending_change';
  tutor_user_id?: string | null;
  proposed_new_start_time?: string | null;
  proposed_change_by?: 'tutor' | 'parent' | null;
};

export type CalendarRange = {
  // Monday 00:00 of the week being shown, in local (display) time.
  weekStart: Date;
};
