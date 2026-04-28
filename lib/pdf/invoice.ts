// Server-side invoice PDF generation via pdf-lib. Returns a Uint8Array.
// Layout: A4, 14mm margin. Header with brand color band + tutor name. Line
// items table. Totals. Payment instructions. Subtle "Generated [date] by
// Crestio" watermark in 8px gray, bottom-right.

import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';
import { BRAND, hexToRgb, type OrgBrand } from './branding';

export type InvoicePdfArgs = {
  org: OrgBrand;
  invoice: {
    number: string;
    issued_on: string;          // YYYY-MM-DD
    due_on: string | null;
    status: string;
    parent_name: string;
    parent_email: string | null;
    student_name: string | null;
    notes: string | null;
    payment_link_url: string | null;
    currency: string;           // ISO
    total_cents: number;
    subtotal_cents: number;
    tax_cents: number;
    line_items: Array<{
      description: string;
      qty: number;              // hours
      rate_cents: number;
      amount_cents: number;
    }>;
  };
};

const A4_W = 595.276;
const A4_H = 841.89;
const MARGIN = 40;        // ~14mm

export async function renderInvoicePdf(args: InvoicePdfArgs): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([A4_W, A4_H]);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const brandColor = hexToRgb(args.org.color);

  // Brand band — 50px tall.
  page.drawRectangle({ x: 0, y: A4_H - 50, width: A4_W, height: 50, color: brandColor });
  page.drawText(args.org.name, {
    x: MARGIN, y: A4_H - 32, size: 16, font: helvBold, color: BRAND.cream,
  });
  if (args.org.tutorName) {
    page.drawText(args.org.tutorName, {
      x: MARGIN, y: A4_H - 46, size: 9, font: helv, color: BRAND.cream,
    });
  }
  page.drawText('INVOICE', {
    x: A4_W - MARGIN - helvBold.widthOfTextAtSize('INVOICE', 16), y: A4_H - 32,
    size: 16, font: helvBold, color: BRAND.cream,
  });

  // Top metadata.
  const metaY = A4_H - 90;
  page.drawText(`#${args.invoice.number}`, { x: MARGIN, y: metaY, size: 18, font: helvBold, color: BRAND.ink });
  page.drawText(formatDateLabel(args.invoice.issued_on), { x: MARGIN, y: metaY - 16, size: 9, font: helv, color: BRAND.inkMuted });
  if (args.invoice.due_on) {
    page.drawText(`Due ${formatDateLabel(args.invoice.due_on)}`, {
      x: A4_W - MARGIN - helv.widthOfTextAtSize(`Due ${formatDateLabel(args.invoice.due_on)}`, 9),
      y: metaY - 16, size: 9, font: helv, color: BRAND.inkMuted,
    });
  }
  // Status pill.
  const statusLabel = args.invoice.status.toUpperCase();
  const statusW = helvBold.widthOfTextAtSize(statusLabel, 8) + 16;
  const statusColor = args.invoice.status === 'paid' ? BRAND.forest : args.invoice.status === 'sent' ? brandColor : BRAND.inkMuted;
  page.drawRectangle({
    x: A4_W - MARGIN - statusW, y: metaY - 4, width: statusW, height: 16,
    color: statusColor, borderWidth: 0,
  });
  page.drawText(statusLabel, {
    x: A4_W - MARGIN - statusW + 8, y: metaY - 1,
    size: 8, font: helvBold, color: BRAND.cream,
  });

  // To.
  let y = metaY - 56;
  page.drawText('BILLED TO', { x: MARGIN, y, size: 8, font: helvBold, color: BRAND.inkSoft });
  y -= 14;
  page.drawText(args.invoice.parent_name, { x: MARGIN, y, size: 11, font: helvBold, color: BRAND.ink });
  y -= 13;
  if (args.invoice.parent_email) {
    page.drawText(args.invoice.parent_email, { x: MARGIN, y, size: 9, font: helv, color: BRAND.inkMuted });
    y -= 13;
  }
  if (args.invoice.student_name) {
    page.drawText(`For ${args.invoice.student_name}`, { x: MARGIN, y, size: 9, font: helv, color: BRAND.inkMuted });
    y -= 13;
  }

  // Line items header.
  y -= 24;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4_W - MARGIN, y }, color: BRAND.rule, thickness: 1 });
  y -= 16;
  page.drawText('DESCRIPTION', { x: MARGIN, y, size: 8, font: helvBold, color: BRAND.inkSoft });
  page.drawText('HRS', { x: A4_W - MARGIN - 200, y, size: 8, font: helvBold, color: BRAND.inkSoft });
  page.drawText('RATE', { x: A4_W - MARGIN - 130, y, size: 8, font: helvBold, color: BRAND.inkSoft });
  const amtX = A4_W - MARGIN - 8 - helvBold.widthOfTextAtSize('AMOUNT', 8);
  page.drawText('AMOUNT', { x: amtX, y, size: 8, font: helvBold, color: BRAND.inkSoft });
  y -= 8;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4_W - MARGIN, y }, color: BRAND.rule, thickness: 1 });

  // Line items.
  for (const item of args.invoice.line_items) {
    y -= 18;
    page.drawText(truncate(helv, item.description, 10, A4_W - MARGIN * 2 - 220), {
      x: MARGIN, y, size: 10, font: helv, color: BRAND.ink,
    });
    page.drawText(formatNum(item.qty), { x: A4_W - MARGIN - 200, y, size: 10, font: helv, color: BRAND.ink });
    page.drawText(formatMoney(item.rate_cents, args.invoice.currency), {
      x: A4_W - MARGIN - 130, y, size: 10, font: helv, color: BRAND.ink,
    });
    const amount = formatMoney(item.amount_cents, args.invoice.currency);
    const amountW = helv.widthOfTextAtSize(amount, 10);
    page.drawText(amount, { x: A4_W - MARGIN - amountW, y, size: 10, font: helv, color: BRAND.ink });
  }

  // Totals.
  y -= 24;
  page.drawLine({ start: { x: A4_W / 2, y }, end: { x: A4_W - MARGIN, y }, color: BRAND.rule, thickness: 1 });
  y -= 16;
  drawRow(page, helv, helvBold, 'Subtotal', formatMoney(args.invoice.subtotal_cents, args.invoice.currency), y, false);
  if (args.invoice.tax_cents > 0) {
    y -= 14;
    drawRow(page, helv, helvBold, 'Tax', formatMoney(args.invoice.tax_cents, args.invoice.currency), y, false);
  }
  y -= 18;
  drawRow(page, helv, helvBold, 'TOTAL', formatMoney(args.invoice.total_cents, args.invoice.currency), y, true);

  // Payment.
  if (args.invoice.payment_link_url && args.invoice.status !== 'paid') {
    y -= 36;
    page.drawText('PAY ONLINE', { x: MARGIN, y, size: 8, font: helvBold, color: BRAND.inkSoft });
    y -= 14;
    page.drawText(args.invoice.payment_link_url, {
      x: MARGIN, y, size: 9, font: helv, color: brandColor,
    });
    y -= 14;
    page.drawText('Card payments via Stripe — settles in 2 business days.', {
      x: MARGIN, y, size: 8, font: helv, color: BRAND.inkMuted,
    });
  }

  if (args.invoice.notes) {
    y -= 24;
    page.drawText('NOTE', { x: MARGIN, y, size: 8, font: helvBold, color: BRAND.inkSoft });
    y -= 12;
    drawWrapped(page, helv, args.invoice.notes, MARGIN, y, A4_W - MARGIN * 2, 9, 11, BRAND.inkMuted);
  }

  // Watermark.
  drawWatermark(page, helv, args.org.name);

  return doc.save();
}

function drawRow(page: any, helv: PDFFont, helvBold: PDFFont, label: string, value: string, y: number, total: boolean) {
  const labelFont = total ? helvBold : helv;
  const valueFont = total ? helvBold : helv;
  const labelSize = total ? 11 : 10;
  const valueSize = total ? 12 : 10;
  const color = total ? BRAND.ink : BRAND.inkMuted;
  page.drawText(label, { x: A4_W / 2, y, size: labelSize, font: labelFont, color });
  const valueW = valueFont.widthOfTextAtSize(value, valueSize);
  page.drawText(value, { x: A4_W - MARGIN - valueW, y, size: valueSize, font: valueFont, color: BRAND.ink });
}

function drawWrapped(page: any, font: PDFFont, text: string, x: number, y: number, maxWidth: number, size: number, lineHeight: number, color: any): number {
  const words = text.split(/\s+/);
  let line = '';
  let cursorY = y;
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth) {
      page.drawText(line, { x, y: cursorY, size, font, color });
      cursorY -= lineHeight;
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) page.drawText(line, { x, y: cursorY, size, font, color });
  return cursorY;
}

function drawWatermark(page: any, helv: PDFFont, orgName: string) {
  const text = `Generated ${new Date().toISOString().slice(0, 10)} by Crestio for ${orgName}`;
  const size = 7;
  const w = helv.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: A4_W - MARGIN - w,
    y: 14,
    size,
    font: helv,
    color: BRAND.inkSoft,
  });
}

function truncate(font: PDFFont, s: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;
  let out = s;
  while (font.widthOfTextAtSize(out + '…', size) > maxWidth && out.length > 1) {
    out = out.slice(0, -1);
  }
  return out + '…';
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
