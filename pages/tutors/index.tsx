import Link from 'next/link';
import { AgencyPage, Section } from '../../components/agency/AgencyPage';
import { AGENCY, SUBJECTS } from '../../lib/agency';
import { breadcrumb } from '../../lib/agencySchema';

const STAGES = [
  ['Apply', 'Five minutes on the form: subjects, results, WWCC status, availability.'],
  ['A short call', '15 minutes on video. Who you are, what you are strong in, how you explain things.'],
  ['Subject test', 'A 30-minute paper in your subject at the level you would tutor. You should find it comfortable.'],
  ['Checks', 'We verify your NSW Working With Children Check online and sight photo ID.'],
  ['Practice lesson', 'A 20-minute lesson on a topic we give you. We are watching for patience and clarity, not polish.'],
  ['Onboarding', 'Contractor agreement, code of conduct, how lessons, notes and payments work. Then your first student.'],
];

const YOU_GET = [
  ['Pay set to your level', 'Rates are tied to the level you tutor and your experience, and you know the exact rate before you accept a student. Paid within seven days of each lesson.'],
  ['Students matched to your strengths', 'You tutor the subjects you are actually strong in. We do the matching, the parent communication and the invoicing.'],
  ['Flexible hours', 'You set your availability. Online, local in-home, or both. Say no to a student without explaining yourself.'],
  ['Everything in one place', 'A schedule, a session log with an AI assistant that turns your rough notes into a parent update, homework tracking and a resource library.'],
];

export default function ForTutors() {
  return (
    <AgencyPage
      title="Tutor with Crestio — maths and physics tutoring jobs in Sydney"
      noSuffix
      description="Tutor maths or physics with Crestio: fair pay set to your level, students matched to your strengths, flexible hours online or in-home across Sydney. Apply in five minutes."
      path="/tutors"
      ogTitle="Tutor with Crestio."
      ogSubtitle="Fair pay, students matched to your strengths, flexible hours. Sydney and online."
      jsonLd={[breadcrumb([{ name: 'Home', url: '/' }, { name: 'For tutors', url: '/tutors' }])]}
    >
      <section className="px-6 md:px-12 pt-14 md:pt-20 pb-10 max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-4">Become a tutor · Sydney & online</div>
          <h1 className="font-display text-4xl md:text-6xl tracking-tighter text-ink text-balance leading-[1.05] mb-5">Tutor with Crestio.</h1>
          <p className="text-base md:text-lg text-ink-muted leading-relaxed mb-7">
            We are building a small team of maths and physics tutors who are good at their subject and good with people. If that is you, we would like to hear from you.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/tutors/apply" className="btn-primary px-6 w-full sm:w-auto">Apply to tutor</Link>
            <a href="#how" className="btn-secondary px-6 w-full sm:w-auto">How selection works</a>
          </div>
        </div>
      </section>

      <Section tone="surface" eyebrow="Who we look for" heading="Strong in the subject. Patient with people. Reliable.">
        <div className="grid md:grid-cols-3 gap-8">
          {[
            ['A strong record', 'A high ATAR, strong HSC marks in the subject, or relevant university study — engineering, maths, physics, science, education. Current university students are very welcome.'],
            ['18 or older, with a WWCC', 'You must be 18 or older and hold a NSW Working With Children Check (paid-worker type), or be willing to get one before your first student. We verify it.'],
            ['Reliable and clear', 'Turns up on time, every week. Explains one thing at a time. Writes a short honest note after each lesson. Tells us early when something is off.'],
          ].map(([t, b]) => (
            <div key={t}>
              <h2 className="text-base font-semibold text-ink mb-1.5">{t}</h2>
              <p className="text-sm text-ink-muted leading-relaxed">{b}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-2">
          {SUBJECTS.map((s) => <span key={s.key} className="pill pill-neutral">{s.label}</span>)}
        </div>
      </Section>

      <Section eyebrow="What you get" heading="Fair pay, better matches, less admin.">
        <div className="grid md:grid-cols-2 gap-8 md:gap-10">
          {YOU_GET.map(([t, b]) => (
            <div key={t} className="rounded-md border border-rule bg-surface p-6">
              <h2 className="font-display text-xl tracking-tighter text-ink mb-2">{t}</h2>
              <p className="text-sm text-ink-muted leading-relaxed">{b}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-ink-muted">Tutors are engaged as independent contractors. We can help you get an ABN if you do not have one.</p>
      </Section>

      <Section id="how" tone="surface" eyebrow="How selection works" heading="Six short stages. About two weeks end to end.">
        <ol className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {STAGES.map(([t, b], i) => (
            <li key={t} className="flex gap-4">
              <div className="font-display text-2xl tracking-tighter text-forest w-7 shrink-0">{i + 1}</div>
              <div>
                <h3 className="text-base font-semibold text-ink mb-1">{t}</h3>
                <p className="text-sm text-ink-muted leading-relaxed">{b}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="forest">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl md:text-4xl tracking-tighter text-cream text-balance mb-4">Ready to apply?</h2>
          <p className="text-base text-cream/80 leading-relaxed mb-7">Five minutes on the form. {AGENCY.founder.firstName} reads every application personally and replies within a week.</p>
          <Link href="/tutors/apply" className="btn bg-cream text-forest-ink hover:bg-white px-6">Apply to tutor</Link>
        </div>
      </Section>
    </AgencyPage>
  );
}
