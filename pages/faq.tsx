import { AgencyPage } from '../components/agency/AgencyPage';
import { FaqList, FinalBand } from '../components/agency/blocks';
import { FAQS } from '../lib/agency';
import { agencyFaqSchema, breadcrumb } from '../lib/agencySchema';

export default function FaqPage() {
  return (
    <AgencyPage
      title="FAQ"
      description="How matching works, where we cover, tutor checks, pricing, the first-lesson guarantee, cancellations and payment, answered plainly."
      path="/faq"
      ogTitle="Good questions, answered plainly."
      jsonLd={[agencyFaqSchema(FAQS), breadcrumb([{ name: 'Home', url: '/' }, { name: 'FAQ', url: '/faq' }])]}
    >
      <section className="px-6 md:px-12 pt-14 md:pt-20 max-w-3xl mx-auto">
        <div className="text-2xs uppercase tracking-widest text-ink-soft mb-4">FAQ</div>
        <h1 className="font-display text-4xl md:text-6xl tracking-tighter text-ink text-balance leading-[1.05]">Good questions, answered plainly.</h1>
      </section>
      <FaqList heading="" id="questions" />
      <FinalBand />
    </AgencyPage>
  );
}
