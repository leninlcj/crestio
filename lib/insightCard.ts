// Daily-rotating insight rendered above "Needs attention" on the dashboard.
// Pulls from the existing /api/dashboard/today payload — no new endpoint.
// Same insight per day for the same user (date-hash deterministic).

export type InsightInput = {
  polished_this_week: number;
  fastest_invoice_paid_hours?: number | null;
  longest_streak_student?: { name: string; sessions: number } | null;
  parent_avg_pay_hours?: number | null;
  total_polished_all_time?: number | null;
};

export type Insight = {
  text: string;
  tone: 'forest' | 'amber' | 'default';
};

export function pickInsight(input: InsightInput, now: Date = new Date()): Insight | null {
  const candidates: Insight[] = [];

  if (input.polished_this_week > 0) {
    const hours = Math.max(1, Math.round(input.polished_this_week * 0.4));
    candidates.push({
      text: `You've sent ${input.polished_this_week} polished ${input.polished_this_week === 1 ? 'note' : 'notes'} this week. Roughly ${hours} ${hours === 1 ? 'hour' : 'hours'} of explaining you didn't have to do.`,
      tone: 'forest',
    });
  }

  if (input.fastest_invoice_paid_hours != null && input.fastest_invoice_paid_hours <= 24) {
    candidates.push({
      text: `The fastest invoice you sent this week was paid in ${input.fastest_invoice_paid_hours} ${input.fastest_invoice_paid_hours === 1 ? 'hour' : 'hours'}.`,
      tone: 'forest',
    });
  }

  if (input.longest_streak_student && input.longest_streak_student.sessions >= 4) {
    candidates.push({
      text: `${input.longest_streak_student.name} has had ${input.longest_streak_student.sessions} sessions in a row without a missed one.`,
      tone: 'default',
    });
  }

  if (input.parent_avg_pay_hours != null && input.parent_avg_pay_hours <= 48) {
    candidates.push({
      text: `Parents pay you within ${input.parent_avg_pay_hours} hours on average.`,
      tone: 'forest',
    });
  }

  if (input.total_polished_all_time != null && input.total_polished_all_time >= 50) {
    const hours = Math.round(input.total_polished_all_time * 0.4);
    candidates.push({
      text: `You've polished ${input.total_polished_all_time} session notes since you started. That's around ${hours} hours back in your week.`,
      tone: 'forest',
    });
  }

  if (candidates.length === 0) return null;

  // Date-hash so the same day shows the same insight per visitor.
  const seed = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return candidates[Math.abs(h) % candidates.length];
}
