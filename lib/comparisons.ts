// Comparison data for /compare/[competitor]. Honest framing — Crestio wins on
// most rows but each competitor has 1-3 places where they're genuinely better
// (sometimes that's just price; sometimes it's depth in a niche we don't cover).

export type CompareCell = 'yes' | 'no' | 'partial' | string; // string for explicit values like "$24"
export type CompareRow = {
  feature: string;
  crestio: CompareCell;
  competitor: CompareCell;
  note?: string;
};
export type CompareSection = {
  key: string;
  title: string;
  rows: CompareRow[];
};

export type CompetitorPage = {
  slug: string;
  competitor: string;
  competitor_url?: string;
  hero_sub: string;
  honest: { heading: string; cases: string[] };
  sections: CompareSection[];
};

const COMMON_PRICING = (priceCompetitor: string): CompareSection => ({
  key: 'pricing',
  title: 'Pricing',
  rows: [
    { feature: 'Starting price', crestio: '$24/month', competitor: priceCompetitor },
    { feature: 'Per-tutor charge on team plan', crestio: 'no', competitor: 'yes' },
    { feature: 'Free trial', crestio: '7 days, no card', competitor: 'partial' },
    { feature: 'Annual discount', crestio: '~17%', competitor: 'partial' },
    { feature: 'Platform fee on parent payments', crestio: '1% (transparent)', competitor: 'partial', note: 'Stripe processing fee is separate, ~2.9%+30c.' },
  ],
});

const COMMON_DATA: CompareSection = {
  key: 'data',
  title: 'Data ownership',
  rows: [
    { feature: 'Full export (CSV + files)', crestio: 'yes', competitor: 'partial' },
    { feature: 'Own your data after cancellation', crestio: 'yes', competitor: 'partial' },
    { feature: 'GDPR / Australian Privacy Act compliant', crestio: 'yes', competitor: 'yes' },
    { feature: 'Data hosted in Australia', crestio: 'yes', competitor: 'no' },
  ],
};

const COMMON_SUPPORT = (responsiveness: CompareCell): CompareSection => ({
  key: 'support',
  title: 'Support',
  rows: [
    { feature: 'Email support', crestio: 'yes', competitor: 'yes' },
    { feature: 'Reply time', crestio: '< 24h', competitor: responsiveness },
    { feature: 'Direct line to the founder', crestio: 'yes', competitor: 'no' },
    { feature: 'Migration help (free)', crestio: 'yes — full white-glove', competitor: 'no' },
  ],
});

export const COMPETITOR_PAGES: Record<string, CompetitorPage> = {
  teachworks: {
    slug: 'teachworks',
    competitor: 'TeachWorks',
    competitor_url: 'https://teachworks.com',
    hero_sub: 'TeachWorks is built for tutoring centers. Crestio is built for the tutor — solo or small team. Here\'s the honest split.',
    honest: {
      heading: 'When TeachWorks is the better choice',
      cases: [
        'You run a tuition centre with 10+ tutors and need built-in payroll, employee scheduling, and group classroom management.',
        'You\'ve been on TeachWorks for 5+ years and your operational habits are deeply tied to its UI — switching cost is real.',
      ],
    },
    sections: [
      {
        key: 'sessions',
        title: 'Sessions',
        rows: [
          { feature: 'Log a session in 8 seconds', crestio: 'yes', competitor: 'no' },
          { feature: 'AI-polished parent updates', crestio: 'yes', competitor: 'no' },
          { feature: 'Press-and-hold voice capture', crestio: 'shipping Q2', competitor: 'no' },
          { feature: 'Drag-to-reschedule on calendar', crestio: 'yes', competitor: 'partial' },
          { feature: 'Recurring session templates', crestio: 'yes', competitor: 'yes' },
          { feature: 'Inline NLP composer ("Tue 4pm Hector")', crestio: 'yes', competitor: 'no' },
        ],
      },
      {
        key: 'notes',
        title: 'Notes & AI',
        rows: [
          { feature: 'Notes that read like you wrote them', crestio: 'yes', competitor: 'no' },
          { feature: 'AI lesson plan generation', crestio: 'yes', competitor: 'no' },
          { feature: 'Per-student progress digest', crestio: 'yes', competitor: 'partial' },
        ],
      },
      {
        key: 'billing',
        title: 'Billing & parent payments',
        rows: [
          { feature: 'Parents pay by card via Stripe', crestio: 'yes', competitor: 'partial' },
          { feature: 'Auto-pay (parent saves card)', crestio: 'shipping Q2', competitor: 'no' },
          { feature: 'Multi-invoice batch payment', crestio: 'yes', competitor: 'no' },
          { feature: 'Refund flow with audit log', crestio: 'yes', competitor: 'partial' },
          { feature: 'GST handling (Australia)', crestio: 'yes', competitor: 'yes' },
        ],
      },
      {
        key: 'parents',
        title: 'Parent portal',
        rows: [
          { feature: 'Branded parent portal (your name, your color)', crestio: 'yes', competitor: 'partial' },
          { feature: 'Parent satisfaction signal per note', crestio: 'shipping Q2', competitor: 'no' },
          { feature: 'Term reports as branded PDFs', crestio: 'shipping Q2', competitor: 'no' },
          { feature: 'Parent-side messages', crestio: 'yes', competitor: 'yes' },
        ],
      },
      {
        key: 'team',
        title: 'Team',
        rows: [
          { feature: 'Multi-tutor with role split', crestio: 'yes (up to 15)', competitor: 'yes' },
          { feature: 'Owner brief on the dashboard', crestio: 'yes', competitor: 'no' },
          { feature: 'Per-tutor payouts', crestio: 'yes', competitor: 'partial' },
          { feature: 'Built for 10+ tutor centres', crestio: 'no', competitor: 'yes' },
        ],
      },
      COMMON_PRICING('$59/mo + $5/tutor'),
      COMMON_DATA,
      COMMON_SUPPORT('1-3 days'),
    ],
  },

  wyzant: {
    slug: 'wyzant',
    competitor: 'Wyzant',
    competitor_url: 'https://wyzant.com',
    hero_sub: 'Wyzant is a marketplace that finds you students and takes ~40% of every session. Crestio is software you own — your students, your money, your brand.',
    honest: {
      heading: 'When Wyzant is the better choice',
      cases: [
        'You\'re brand new to tutoring and need help finding your first students.',
        'You don\'t want to run your own practice — you want a marketplace to handle discovery, payments, and disputes for a percentage.',
      ],
    },
    sections: [
      {
        key: 'business',
        title: 'Your business',
        rows: [
          { feature: 'Keep 100% of what parents pay', crestio: 'yes', competitor: 'no' },
          { feature: 'Marketplace takes 25-40% of every session', crestio: 'no', competitor: 'yes' },
          { feature: 'Build your own brand', crestio: 'yes', competitor: 'no' },
          { feature: 'Own your client list', crestio: 'yes', competitor: 'no' },
          { feature: 'Set your own rates without platform caps', crestio: 'yes', competitor: 'partial' },
        ],
      },
      {
        key: 'sessions',
        title: 'Sessions & notes',
        rows: [
          { feature: 'AI-polished parent updates', crestio: 'yes', competitor: 'no' },
          { feature: 'Voice-to-session', crestio: 'shipping Q2', competitor: 'no' },
          { feature: 'Recurring templates', crestio: 'yes', competitor: 'no' },
          { feature: 'Watermarked file sharing with parents', crestio: 'yes', competitor: 'no' },
        ],
      },
      {
        key: 'discovery',
        title: 'Student discovery',
        rows: [
          { feature: 'Built-in marketplace of new students', crestio: 'no', competitor: 'yes' },
          { feature: 'Lead generation', crestio: 'no', competitor: 'yes' },
        ],
      },
      COMMON_PRICING('Free + 25-40% per session'),
      COMMON_DATA,
      COMMON_SUPPORT('Variable'),
    ],
  },

  spreadsheet: {
    slug: 'spreadsheet',
    competitor: 'a spreadsheet',
    hero_sub: 'A spreadsheet is free and infinitely flexible. Crestio is a spreadsheet that does the work itself.',
    honest: {
      heading: 'When a spreadsheet is the better choice',
      cases: [
        'You have under 3 students, charge cash, and don\'t need parent updates.',
        'You enjoy building spreadsheets and consider Sunday admin a hobby.',
      ],
    },
    sections: [
      {
        key: 'time',
        title: 'Sunday afternoons',
        rows: [
          { feature: '8-second session log', crestio: 'yes', competitor: 'no' },
          { feature: 'Notes write themselves into parent updates', crestio: 'yes', competitor: 'no' },
          { feature: 'Invoices generate from sessions', crestio: 'yes', competitor: 'partial', note: 'Possible with formulas, but you\'re a developer now.' },
          { feature: 'Parents pay you by card automatically', crestio: 'yes', competitor: 'no' },
          { feature: 'No copy-paste between tabs', crestio: 'yes', competitor: 'no' },
        ],
      },
      {
        key: 'parents',
        title: 'Parents',
        rows: [
          { feature: 'Branded parent portal', crestio: 'yes', competitor: 'no' },
          { feature: 'View-only file viewer with audit logs', crestio: 'yes', competitor: 'no' },
          { feature: 'Reschedule via the parent\'s phone', crestio: 'yes', competitor: 'no' },
        ],
      },
      {
        key: 'safety',
        title: 'Safety',
        rows: [
          { feature: 'Encrypted, backed up, version-controlled', crestio: 'yes', competitor: 'partial' },
          { feature: 'Won\'t corrupt itself when a formula breaks', crestio: 'yes', competitor: 'no' },
          { feature: 'Not lost if your laptop is', crestio: 'yes', competitor: 'partial' },
        ],
      },
      COMMON_PRICING('Free'),
      {
        key: 'support',
        title: 'When something breaks',
        rows: [
          { feature: 'Someone responds', crestio: 'yes — within 24h', competitor: 'no' },
          { feature: 'Migration help', crestio: 'yes (free)', competitor: 'no' },
        ],
      },
    ],
  },

  notion: {
    slug: 'notion',
    competitor: 'Notion',
    competitor_url: 'https://notion.so',
    hero_sub: 'Notion is a beautiful blank page. Crestio is a tool that already knows what a tutoring practice looks like.',
    honest: {
      heading: 'When Notion is the better choice',
      cases: [
        'You love systems-building and want to design your own tutoring database from scratch.',
        'You already use Notion for everything else and want a single tool — even at the cost of building it yourself.',
      ],
    },
    sections: [
      {
        key: 'workflows',
        title: 'Tutoring workflows',
        rows: [
          { feature: 'Pre-built session log, notes, invoices', crestio: 'yes', competitor: 'no', note: 'Notion templates exist but are skeletons.' },
          { feature: 'AI-polished parent updates', crestio: 'yes', competitor: 'partial', note: 'Notion AI is general-purpose; not tuned to a tutor\'s voice.' },
          { feature: 'Stripe parent payments built in', crestio: 'yes', competitor: 'no' },
          { feature: 'Watermarked file viewer with audit', crestio: 'yes', competitor: 'no' },
          { feature: 'Calendar with drag-to-reschedule', crestio: 'yes', competitor: 'partial' },
        ],
      },
      {
        key: 'flexibility',
        title: 'Flexibility',
        rows: [
          { feature: 'Custom databases and views', crestio: 'partial', competitor: 'yes' },
          { feature: 'Connect to anything', crestio: 'shipping Q4 via API', competitor: 'yes' },
        ],
      },
      COMMON_PRICING('$10-20/seat/month'),
      COMMON_DATA,
      COMMON_SUPPORT('1-2 days'),
    ],
  },

  tutorbird: {
    slug: 'tutorbird',
    competitor: 'TutorBird',
    competitor_url: 'https://tutorbird.com',
    hero_sub: 'TutorBird is a music-school staple. Crestio is a tutor-first tool that handles music too — and stops there.',
    honest: {
      heading: 'When TutorBird is the better choice',
      cases: [
        'You run a music school with recital ticketing, instrument rental tracking, and ensemble management baked in.',
        'You\'ve been on TutorBird for years and the workflow is in your team\'s muscle memory.',
      ],
    },
    sections: [
      {
        key: 'sessions',
        title: 'Sessions',
        rows: [
          { feature: '8-second session log', crestio: 'yes', competitor: 'no' },
          { feature: 'AI-polished parent updates', crestio: 'yes', competitor: 'no' },
          { feature: 'Recurring templates', crestio: 'yes', competitor: 'yes' },
          { feature: 'Track instrument practice goals', crestio: 'partial', competitor: 'yes', note: 'Crestio supports this via free-text session notes only — no structured practice-goal tracker.' },
        ],
      },
      {
        key: 'music',
        title: 'Music-specific',
        rows: [
          { feature: 'Recital ticket sales', crestio: 'no', competitor: 'yes' },
          { feature: 'Instrument rental tracking', crestio: 'no', competitor: 'yes' },
          { feature: 'Sheet music PDFs (watermarked)', crestio: 'yes', competitor: 'partial' },
        ],
      },
      {
        key: 'parents',
        title: 'Parents',
        rows: [
          { feature: 'Parents pay by card', crestio: 'yes', competitor: 'partial' },
          { feature: 'Branded parent portal', crestio: 'yes', competitor: 'yes' },
          { feature: 'Parent satisfaction signal', crestio: 'shipping Q2', competitor: 'no' },
        ],
      },
      COMMON_PRICING('$15-25/mo + $1/student'),
      COMMON_DATA,
      COMMON_SUPPORT('1-2 days'),
    ],
  },
};

export function getCompetitor(slug: string): CompetitorPage | null {
  return COMPETITOR_PAGES[slug] ?? null;
}
