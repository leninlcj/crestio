// Customer stories. Stub content marked is_real:false — replace as real
// customers consent. Voice: peer-to-peer, specific, no marketing-speak.

export type CustomerStat = { label: string; value: string };

export type CustomerStory = {
  slug: string;
  name: string;
  practice: string;
  city: string;
  subject: string;
  photo: string;            // /marketing/customers/<slug>.jpg or fallback initials
  result_one_line: string;
  context: string;
  stats: CustomerStat[];
  quote: string;
  problem: string;          // 1-2 short paragraphs
  solution: string;         // 1-2 short paragraphs
  results: string;          // 1-2 short paragraphs
  is_real: boolean;
};

export const CUSTOMER_STORIES: CustomerStory[] = [
  {
    slug: 'sarah-k',
    name: 'Sarah K.',
    practice: 'Sarah K. Tutoring',
    city: 'Sydney',
    subject: 'HSC English',
    photo: '/marketing/customers/sarah-k.jpg',
    result_one_line: 'Cut Sunday admin from 4 hours to 25 minutes',
    context: 'HSC English · 8 students · Sydney',
    stats: [
      { label: 'Students', value: '8' },
      { label: 'Billed per month', value: '$3,200' },
      { label: 'Hours saved per week', value: '2.4' },
    ],
    quote: 'I used to dread Sundays. Now I open the app, polish three notes, send four invoices, and I\'m done in 25 minutes. The polish feature alone is worth the subscription.',
    problem:
      'Sarah was tutoring eight HSC English students out of her flat in Newtown. She had a paper notebook for session notes, a Google Sheet for invoicing, and an inbox of unread parent texts. Sundays were four hours of admin she didn\'t want to do.\n\nThe worst part was the parent updates. She\'d write rough notes during a session, then on Sunday rewrite them as polite paragraphs to send to mums and dads — eight times over. By the time she finished, it was Sunday evening and she hadn\'t looked at her own week.',
    solution:
      'Sarah started using Crestio in February 2026. She logs each session in the inline composer (8 seconds of typing). After the session ends, she presses one button to polish the note — the rough version becomes a paragraph that reads like she wrote it on a good day, in her voice.\n\nShe sends the polished note to the parent. Same thing for invoicing — Friday afternoon she taps "draft them all" and sends eight invoices in one batch. Parents pay by card.',
    results:
      'In her first month, Sarah\'s Sunday admin went from four hours to twenty-five minutes. She gained back about 2.4 hours per week. Parents are responding faster — invoices that used to sit unpaid for a week now get paid in 24-48 hours.\n\nAnd the parents say the notes are clearer than they used to be. One mum told her, "I actually understand what my son is working on now." Sarah did not change anything about her teaching — only about how she communicates it.',
    is_real: false,
  },
  {
    slug: 'marcus-owens',
    name: 'Marcus Owens',
    practice: 'Owens Academic',
    city: 'Melbourne',
    subject: 'Maths & Science · 4 tutors',
    photo: '/marketing/customers/marcus-owens.jpg',
    result_one_line: 'Saw the practice clearly for the first time in three years',
    context: 'Maths & Science · 4 tutors · 31 students · Melbourne',
    stats: [
      { label: 'Tutors', value: '4' },
      { label: 'Students', value: '31' },
      { label: 'Sessions a week', value: '52' },
    ],
    quote: 'Before Crestio, I was the bottleneck. Tutors texted me their session notes, I forwarded them to parents, I chased invoices. The owner brief in the morning is the thing I didn\'t know I needed.',
    problem:
      'Marcus runs Owens Academic — four tutors covering maths and science across Melbourne\'s eastern suburbs. He moved from a one-tutor practice to four in 18 months, and the operational load grew faster than the revenue.\n\nThe issue wasn\'t any single thing. It was that he was the only person who could see the whole picture. Did Mei tutor Hector this week? Did Aiden\'s notes go to his mum? Was the Bayside invoice paid yet? Marcus was the human dashboard, and on bad weeks he hated it.',
    solution:
      'Crestio\'s owner brief shows up every morning. Yesterday: 9 sessions across 4 tutors, $1,840 earned, 2 notes pending more than 48 hours. Action needed: nudge James about the Patel session note. Marcus reads it in 30 seconds with his coffee.\n\nThe rest of the practice runs without him in the loop. Tutors log their own sessions, polish their own notes, send to parents. He sees the team\'s aggregate without micromanaging anyone.',
    results:
      'Marcus reclaimed about 6 hours a week of operations. He used some of that to take on three more students. He used the rest to actually plan curriculum with his tutors — the thing he originally hired them to do good work on.\n\nHe says the biggest thing isn\'t the time saved. It\'s knowing the practice is fine without him watching it. He took a week in Tasmania last month and did not check his email once.',
    is_real: false,
  },
  {
    slug: 'james-park',
    name: 'James Park',
    practice: 'Park Tutoring',
    city: 'Auckland',
    subject: 'IB Mathematics',
    photo: '/marketing/customers/james-park.jpg',
    result_one_line: 'Switched from TeachWorks in three days, kept every student',
    context: 'IB Mathematics · 12 students · Auckland',
    stats: [
      { label: 'Students', value: '12' },
      { label: 'Migration time', value: '3 days' },
      { label: 'Students lost', value: '0' },
    ],
    quote: 'I was on TeachWorks for four years. Switching felt like changing banks — terrifying. The migration team moved everything in a weekend. I didn\'t have to retrain a single parent.',
    problem:
      'James had been on TeachWorks since 2022. He didn\'t love it, but the cost of switching seemed enormous — twelve parents had been clicking the same login link for years, his student notes were trapped in a UI he couldn\'t export cleanly from, and he\'d built up four years of session history.\n\nThe specific thing that pushed him: TeachWorks raised prices in February 2026 and he realised he was paying $89/month for a calendar app and a billing module he barely used.',
    solution:
      'James emailed Crestio about migration. The next day Lenin replied and asked for a CSV export from TeachWorks. James sent it Saturday morning. By Monday his Crestio account was pre-populated with all twelve students, eight months of session history, every invoice (paid and pending), and the parent emails on file.\n\nHe sent each parent one email: "Hi, I\'ve moved to a new system. Here\'s the new login link. Same as before — you\'ll see your child\'s session notes and invoices. Reply if anything looks off." Eleven of twelve parents replied within 48 hours saying it was clearer than the old portal.',
    results:
      'Zero students lost. Three days of total switching effort. James now pays $24/month instead of $89/month — but he says the bigger thing is the polish feature, which he didn\'t have before. His session notes used to be a screenshot of his Apple Notes app pasted into an email. Now they\'re proper paragraphs that read like a teacher wrote them.\n\nHe\'s recommended Crestio to two friends. Both switched within a month.',
    is_real: false,
  },
];

export function getCustomerStory(slug: string): CustomerStory | null {
  return CUSTOMER_STORIES.find((s) => s.slug === slug) ?? null;
}
