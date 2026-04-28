// Renders a template body string with {{path.to.value}} variables substituted
// from a context object.  Missing variables render as "" (empty string) and
// log a warning so callers see drift early.
//
// Supported placeholder syntax:
//   {{ student.first_name }}
//   {{ session.date }}
//   {{ invoice.amount }}     — amount is auto-formatted if shaped {amount, currency}
//
// No expressions, no conditionals, no loops — keep it boring.

export type RenderContext = Record<string, unknown>;

const PLACEHOLDER_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export function renderTemplate(body: string, ctx: RenderContext, opts?: { warn?: boolean }): string {
  if (!body) return '';
  return body.replace(PLACEHOLDER_RE, (_match, path: string) => {
    const value = resolvePath(ctx, path);
    if (value == null) {
      if (opts?.warn !== false) {
        console.warn(`[template] missing variable {{${path}}}`);
      }
      return '';
    }
    return String(value);
  });
}

function resolvePath(obj: RenderContext, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null) return null;
    if (typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[p];
  }
  // Auto-format money objects.
  if (cur && typeof cur === 'object' && 'amount' in cur && 'currency' in cur) {
    const amount = (cur as any).amount;
    const currency = (cur as any).currency;
    if (typeof amount === 'number') {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency ?? 'AUD' }).format(amount / 100);
    }
  }
  return cur;
}

// Built-in variable catalog — surfaced in the template editor as a "what's
// available" reference.  Each entry includes a sample value so the editor
// can render a live preview.
export const TEMPLATE_VARS_CATALOG: Record<string, { vars: Record<string, string>; sample: RenderContext }> = {
  message: {
    vars: {
      'student.first_name': "Student's first name",
      'student.full_name': "Student's full name",
      'tutor.name': "Tutor's name",
      'parent.first_name': "Parent's first name",
      'org.name': 'Your business name',
      'session.date': 'Date of the latest session',
      'session.subject': 'Subject of the latest session',
    },
    sample: {
      student: { first_name: 'Diego', full_name: 'Diego Hernandez' },
      tutor: { name: 'Sarah' },
      parent: { first_name: 'Maria' },
      org: { name: 'Hartley Tutoring' },
      session: { date: 'Tue 29 Apr', subject: 'English' },
    },
  },
  note: {
    vars: {
      'student.first_name': "Student's first name",
      'session.date': 'Session date',
      'session.subject': 'Subject covered',
      'session.topic': 'Topic',
      'tutor.name': "Tutor's name",
    },
    sample: {
      student: { first_name: 'Diego' },
      session: { date: 'Tue 29 Apr', subject: 'English', topic: 'HSC essay structure' },
      tutor: { name: 'Sarah' },
    },
  },
  invoice: {
    vars: {
      'invoice.number': 'Invoice number',
      'invoice.amount': 'Total amount',
      'invoice.due_date': 'Due date',
      'parent.first_name': "Parent's first name",
      'org.name': 'Your business name',
    },
    sample: {
      invoice: { number: 'INV-042', amount: { amount: 24000, currency: 'AUD' }, due_date: '14 May' },
      parent: { first_name: 'Maria' },
      org: { name: 'Hartley Tutoring' },
    },
  },
};
