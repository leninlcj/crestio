// Detect the type of pasted content and return formatted output for the
// target editor. Returns null when the content should be pasted as-is
// (no special handling).
//
// Used by RichEditor, message composer, and notes textareas.

export type PasteResult =
  | { kind: 'url'; html: string }
  | { kind: 'phone'; text: string }
  | { kind: 'email'; html: string }
  | { kind: 'list'; html: string }
  | { kind: 'numbered'; html: string }
  | { kind: 'code'; html: string };

const URL_RE = /^https?:\/\/[^\s]+$/;
const PHONE_RE = /^[+()0-9 .\-x]{7,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function smartPaste(raw: string): PasteResult | null {
  const text = raw.trim();
  if (!text) return null;

  // Single-line: URL, phone, email
  if (!text.includes('\n')) {
    if (URL_RE.test(text)) {
      const pretty = prettifyUrl(text);
      return {
        kind: 'url',
        html: `<a href="${escapeAttr(text)}" target="_blank" rel="noopener noreferrer">${escape(pretty)}</a>`,
      };
    }
    if (EMAIL_RE.test(text)) {
      return {
        kind: 'email',
        html: `<a href="mailto:${escapeAttr(text)}">${escape(text)}</a>`,
      };
    }
    if (PHONE_RE.test(text)) {
      return { kind: 'phone', text: prettifyPhone(text) };
    }
    return null;
  }

  // Multi-line: detect list/numbered/code
  const lines = text.split(/\r?\n/);
  const trimmed = lines.map((l) => l.trimEnd());
  const allBullet = trimmed.every((l) => /^\s*[-*]\s+\S/.test(l));
  const allNumbered = trimmed.every((l) => /^\s*\d+\.\s+\S/.test(l));
  const allCodeIndent = trimmed.every((l) => /^\s{2,}\S/.test(l)) || trimmed.every((l) => /^\t/.test(l));
  const fenced = /^```[\s\S]*```$/.test(text);

  if (allBullet) {
    const items = trimmed.map((l) => l.replace(/^\s*[-*]\s+/, ''));
    return {
      kind: 'list',
      html: '<ul>' + items.map((i) => `<li>${escape(i)}</li>`).join('') + '</ul>',
    };
  }
  if (allNumbered) {
    const items = trimmed.map((l) => l.replace(/^\s*\d+\.\s+/, ''));
    return {
      kind: 'numbered',
      html: '<ol>' + items.map((i) => `<li>${escape(i)}</li>`).join('') + '</ol>',
    };
  }
  if (allCodeIndent || fenced) {
    const inner = fenced ? text.replace(/^```|```$/g, '').trim() : text;
    return {
      kind: 'code',
      html: `<code style="font-family: 'IBM Plex Mono', monospace; background: rgba(234,234,230,0.5); padding: 2px 4px; border-radius: 3px;">${escape(inner)}</code>`,
    };
  }
  return null;
}

function prettifyUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.host + (url.pathname && url.pathname !== '/' ? url.pathname : '');
  } catch { return u; }
}

function prettifyPhone(p: string): string {
  // Strip extra whitespace and normalize separators.
  return p.replace(/\s{2,}/g, ' ').trim();
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '%22');
}
