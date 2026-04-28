// Quarterly term-report PDF — consolidates polished session notes for one
// student across a date range. Tutor branding header, summary stats,
// per-session entries, optional tutor's term comments, watermark.

import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';
import { BRAND, hexToRgb, type OrgBrand } from './branding';

export type TermReportPdfArgs = {
  org: OrgBrand;
  student_name: string;
  term_label: string;          // "Term 2 · 2026" or "April-June 2026"
  term_start: string;          // YYYY-MM-DD
  term_end: string;            // YYYY-MM-DD
  total_sessions: number;
  total_hours: number;
  attendance_rate_pct: number;
  tutor_comment: string | null;
  sessions: Array<{
    date: string;              // YYYY-MM-DD
    subject: string | null;
    duration_minutes: number;
    polished_notes: string | null;
  }>;
};

const A4_W = 595.276;
const A4_H = 841.89;
const MARGIN = 44;

export async function renderTermReportPdf(args: TermReportPdfArgs): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const helvItalic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const brandColor = hexToRgb(args.org.color);

  let page = doc.addPage([A4_W, A4_H]);
  let y = renderHeader(page, helv, helvBold, args, brandColor);

  // Summary box.
  y -= 24;
  page.drawRectangle({
    x: MARGIN, y: y - 70, width: A4_W - MARGIN * 2, height: 70,
    color: BRAND.forestSoft, borderWidth: 0,
  });
  const stats: Array<{ label: string; value: string }> = [
    { label: 'Sessions', value: String(args.total_sessions) },
    { label: 'Hours', value: `${args.total_hours.toFixed(1)}h` },
    { label: 'Attendance', value: `${Math.round(args.attendance_rate_pct)}%` },
  ];
  const statW = (A4_W - MARGIN * 2) / stats.length;
  stats.forEach((s, i) => {
    const cx = MARGIN + statW * i + statW / 2;
    page.drawText(s.label.toUpperCase(), {
      x: cx - helv.widthOfTextAtSize(s.label.toUpperCase(), 8) / 2,
      y: y - 22,
      size: 8, font: helvBold, color: BRAND.forestInk,
    });
    page.drawText(s.value, {
      x: cx - helvBold.widthOfTextAtSize(s.value, 24) / 2,
      y: y - 50,
      size: 24, font: helvBold, color: BRAND.forestInk,
    });
  });
  y -= 88;

  // Tutor comment.
  if (args.tutor_comment) {
    page.drawText(`A NOTE FROM ${(args.org.tutorName ?? 'YOUR TUTOR').toUpperCase()}`, {
      x: MARGIN, y, size: 8, font: helvBold, color: BRAND.inkSoft,
    });
    y -= 14;
    y = drawWrapped(page, helvItalic, args.tutor_comment, MARGIN, y, A4_W - MARGIN * 2, 11, 14, BRAND.ink);
    y -= 16;
  }

  // Session entries.
  y -= 8;
  page.drawText('SESSIONS', { x: MARGIN, y, size: 8, font: helvBold, color: BRAND.inkSoft });
  y -= 12;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4_W - MARGIN, y }, color: BRAND.rule, thickness: 1 });

  for (const s of args.sessions) {
    if (y < 140) {
      page = doc.addPage([A4_W, A4_H]);
      y = A4_H - MARGIN;
    }
    y -= 18;
    const dateLabel = formatDateLabel(s.date);
    page.drawText(dateLabel, { x: MARGIN, y, size: 10, font: helvBold, color: BRAND.ink });
    const subj = s.subject ?? '';
    if (subj) {
      page.drawText(subj, { x: MARGIN + 90, y, size: 10, font: helv, color: BRAND.inkMuted });
    }
    const dur = `${s.duration_minutes} min`;
    page.drawText(dur, { x: A4_W - MARGIN - helv.widthOfTextAtSize(dur, 9), y, size: 9, font: helv, color: BRAND.inkSoft });
    y -= 14;
    if (s.polished_notes) {
      y = drawWrapped(page, helv, s.polished_notes, MARGIN, y, A4_W - MARGIN * 2, 9, 12, BRAND.inkMuted);
    } else {
      page.drawText('Notes not yet polished.', { x: MARGIN, y, size: 9, font: helvItalic, color: BRAND.inkSoft });
      y -= 12;
    }
    y -= 10;
  }

  // Watermark on every page.
  for (const p of doc.getPages()) {
    drawWatermark(p, helv, args.org.name);
  }

  return doc.save();
}

function renderHeader(page: any, helv: PDFFont, helvBold: PDFFont, args: TermReportPdfArgs, brandColor: any): number {
  page.drawRectangle({ x: 0, y: A4_H - 80, width: A4_W, height: 80, color: brandColor });
  page.drawText(args.org.name, {
    x: MARGIN, y: A4_H - 36, size: 18, font: helvBold, color: BRAND.cream,
  });
  if (args.org.tutorName) {
    page.drawText(args.org.tutorName, {
      x: MARGIN, y: A4_H - 56, size: 10, font: helv, color: BRAND.cream,
    });
  }
  const right = 'TERM REPORT';
  page.drawText(right, {
    x: A4_W - MARGIN - helvBold.widthOfTextAtSize(right, 14),
    y: A4_H - 36, size: 14, font: helvBold, color: BRAND.cream,
  });
  page.drawText(args.term_label, {
    x: A4_W - MARGIN - helv.widthOfTextAtSize(args.term_label, 10),
    y: A4_H - 56, size: 10, font: helv, color: BRAND.cream,
  });

  let y = A4_H - 110;
  page.drawText('FOR', { x: MARGIN, y, size: 8, font: helvBold, color: BRAND.inkSoft });
  y -= 16;
  page.drawText(args.student_name, { x: MARGIN, y, size: 22, font: helvBold, color: BRAND.ink });
  y -= 16;
  page.drawText(`${formatDateLabel(args.term_start)} — ${formatDateLabel(args.term_end)}`, {
    x: MARGIN, y, size: 9, font: helv, color: BRAND.inkMuted,
  });
  return y - 16;
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

function drawWrapped(page: any, font: PDFFont, text: string, x: number, y: number, maxWidth: number, size: number, lineHeight: number, color: any): number {
  const paragraphs = text.split(/\n\n+/);
  let cursorY = y;
  for (const para of paragraphs) {
    const lines = para.split('\n');
    for (const rawLine of lines) {
      const words = rawLine.split(/\s+/);
      let line = '';
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
      if (line) {
        page.drawText(line, { x, y: cursorY, size, font, color });
        cursorY -= lineHeight;
      }
    }
    cursorY -= 4;
  }
  return cursorY;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
