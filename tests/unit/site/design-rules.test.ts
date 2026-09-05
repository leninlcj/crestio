import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Lenin's rules for the public site, enforced in CI so they cannot drift:
// no em dashes, no pill-shaped buttons, no emoji icons, no gradients or
// purple, no "made with" badges, no marketing filler words, and no
// invented numbers. See README.md, "Design rules".

const ROOT = path.resolve(__dirname, '../../..');

const PUBLIC_DIRS = ['components/agency', 'components/marketing'];
const PUBLIC_FILES = [
  'pages/index.tsx', 'pages/how-it-works.tsx', 'pages/maths-tutoring.tsx', 'pages/physics-tutoring.tsx',
  'pages/pricing.tsx', 'pages/tutors/index.tsx', 'pages/tutors/apply.tsx', 'pages/tutors/agreement.tsx',
  'pages/enquire.tsx', 'pages/faq.tsx', 'pages/about.tsx', 'pages/programs.tsx', 'pages/tutors/handbook.tsx',
  'pages/tutoring/index.tsx', 'pages/tutoring/[suburb].tsx', 'pages/es.tsx', 'lib/programs.ts', 'lib/tutorHandbook.ts', 'lib/suburbs.ts', 'lib/enquiryCopy.ts', 'pages/contact.tsx', 'pages/child-safe.tsx',
  'pages/report.tsx', 'pages/privacy.tsx', 'pages/terms.tsx', 'pages/cookies.tsx', 'pages/auth/signup.tsx',
  'pages/auth/signin.tsx', 'pages/404.tsx', 'pages/500.tsx', 'pages/_document.tsx', 'pages/_app.tsx',
  'lib/agency.ts', 'lib/agencyLegal.ts', 'lib/agencySchema.ts', 'lib/agencyForms.ts', 'lib/emails/agency.ts',
  'lib/pdf/invoice.ts', 'public/manifest.json', 'public/robots.txt',
];

// Every source file whose strings can reach a screen or an inbox.
const ALL_SOURCE_DIRS = ['pages', 'components', 'lib', 'public/locales/en'];
// Parsers and sanitisers that legitimately mention the character.
const EM_DASH_ALLOWED = new Set(['lib/emails/agency.ts', 'lib/useNlpParse.ts', 'lib/changelog.ts']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.cache') continue;
      walk(full, out);
    } else if (/\.(tsx?|json|txt|css)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function rel(p: string): string {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

function publicFiles(): string[] {
  const files = PUBLIC_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
  for (const f of PUBLIC_FILES) files.push(path.join(ROOT, f));
  return files.filter((f) => fs.existsSync(f));
}

function isComment(line: string): boolean {
  return /^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line);
}

describe('design rules: em dashes', () => {
  it('no em dash reaches a screen or an email', () => {
    const offenders: string[] = [];
    for (const dir of ALL_SOURCE_DIRS) {
      for (const file of walk(path.join(ROOT, dir))) {
        const r = rel(file);
        if (EM_DASH_ALLOWED.has(r)) continue;
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          if (line.includes('—') && !isComment(line)) offenders.push(`${r}:${i + 1}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('public-facing files carry no em dash at all, comments included', () => {
    const offenders = publicFiles().filter((f) => fs.readFileSync(f, 'utf8').includes('—')).map(rel);
    expect(offenders).toEqual([]);
  });
});

describe('design rules: shapes, colours, icons, badges', () => {
  const files = publicFiles();

  it('no pill-shaped buttons or links', () => {
    const offenders: string[] = [];
    for (const f of files) {
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (line.includes('rounded-full') && /<(a|button|Link)\b|btn/.test(line)) offenders.push(`${rel(f)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('status tags are square-cornered', () => {
    const css = fs.readFileSync(path.join(ROOT, 'styles/globals.css'), 'utf8');
    const pill = css.match(/\.pill\s*\{[^}]*\}/);
    expect(pill?.[0]).toContain('border-radius: 4px');
  });

  it('no gradients, purple or violet', () => {
    const targets = [...files, path.join(ROOT, 'styles/globals.css'), path.join(ROOT, 'tailwind.config.ts')];
    const offenders = targets.filter((f) => fs.existsSync(f) && /gradient|purple|violet|indigo|fuchsia/i.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('no emoji used as icons or decoration', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}\u{1F000}-\u{1F2FF}]/u;
    const offenders = files.filter((f) => emoji.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('no "made with" or "powered by" badge', () => {
    const offenders = files.filter((f) => /made with|built with|powered by/i.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('no scroll-triggered or cursor animations on the public site', () => {
    const offenders = files.filter((f) => /IntersectionObserver|framer-motion|data-aos|cursor-follow|custom-cursor|parallax/.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
  });
});

describe('design rules: copy', () => {
  const files = publicFiles();
  const BANNED = [
    'seamless', 'leverage', 'delve', 'unlock', 'elevate', 'empower', 'robust', 'cutting-edge', 'world-class',
    'testament', 'tapestry', 'crucial', 'pivotal', 'vibrant', 'showcase', 'underscore', 'meticulous', 'garner',
    'foster', 'enhance', 'boasts', 'renowned', 'groundbreaking', 'game-changer', 'supercharge', 'next-level',
    'best-in-class', 'state-of-the-art', 'holistic', 'synerg', 'journey', 'passionate', 'excellence',
  ];

  it('no marketing filler words', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8').toLowerCase();
      for (const w of BANNED) if (text.includes(w)) offenders.push(`${rel(f)}: ${w}`);
    }
    expect(offenders).toEqual([]);
  });

  it('no invented counters, ratings or testimonials', () => {
    const patterns = [/\d[\d,]*\+\s*(students|families|tutors|parents|lessons|hours)/i, /\d+(\.\d+)?\s*\/\s*5/, /★|⭐/, /trusted by/i, /join \d/i, /\d+%\s*(of parents|satisfaction|success)/i, /<blockquote/];
    const offenders: string[] = [];
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      for (const p of patterns) if (p.test(text)) offenders.push(`${rel(f)}: ${p}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('launch checklist', () => {
  it('favicon set, manifest, privacy and terms pages exist', () => {
    for (const f of ['public/favicon.ico', 'public/favicon.svg', 'public/apple-touch-icon.png', 'public/manifest.json', 'pages/privacy.tsx', 'pages/terms.tsx', 'pages/cookies.tsx']) {
      expect(fs.existsSync(path.join(ROOT, f)), f).toBe(true);
    }
    const doc = fs.readFileSync(path.join(ROOT, 'pages/_document.tsx'), 'utf8');
    expect(doc).toContain('/favicon.ico');
    expect(doc).toContain('/favicon.svg');
  });

  it('the site points at its own domain', () => {
    const agency = fs.readFileSync(path.join(ROOT, 'lib/agency.ts'), 'utf8');
    expect(agency).toContain("siteUrl: 'https://crestio.ai'");
  });
});
