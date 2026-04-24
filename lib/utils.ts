// -----------------------------------------------------------------------------
// Currency
// -----------------------------------------------------------------------------
export function formatCents(
  cents: number | null | undefined,
  currency = 'AUD',
  opts: { showZero?: boolean } = {}
): string {
  if (cents === null || cents === undefined) return '—';
  if (cents === 0 && !opts.showZero) return '—';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatCentsDetailed(cents: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function dollarsToCents(dollars: number | string): number {
  const n = typeof dollars === 'string' ? parseFloat(dollars) : dollars;
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

export function centsToDollars(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2);
}

// -----------------------------------------------------------------------------
// Dates
// -----------------------------------------------------------------------------
export function formatDate(iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', opts ?? { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
}

export function formatDayLong(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function relativeDay(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((target.getTime() - start.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-AU', { weekday: 'long' });
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export function toDateTimeLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocalInput(v: string): string {
  // Treats input as local time, returns ISO string
  return new Date(v).toISOString();
}

export function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfWeek(d = new Date()): Date {
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  const r = new Date(d);
  r.setDate(d.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

// -----------------------------------------------------------------------------
// Misc
// -----------------------------------------------------------------------------
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function sessionAmount(s: { duration_minutes: number; charge_rate_cents: number | null }): number {
  if (!s.charge_rate_cents) return 0;
  return Math.round((s.charge_rate_cents * s.duration_minutes) / 60);
}

export function tutorPayAmount(s: { duration_minutes: number; pay_rate_cents: number | null }): number {
  if (!s.pay_rate_cents) return 0;
  return Math.round((s.pay_rate_cents * s.duration_minutes) / 60);
}

export function generateInvoiceNumber(existing: number): string {
  return `INV-${String(existing + 1).padStart(4, '0')}`;
}
