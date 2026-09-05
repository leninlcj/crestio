import { AgencyPage } from '../components/agency/AgencyPage';
import { Hero, HowItWorks, SubjectGrid, WhyCrestio, PricingSummary, TutorBand, ReviewsBand, FaqList, FinalBand } from '../components/agency/blocks';
import { agencyOrganizationSchema, tutoringServiceSchema, agencyFaqSchema } from '../lib/agencySchema';

export default function Home() {
  return (
    <AgencyPage
      title="Maths and physics tutoring in Sydney and online | Crestio Tutoring"
      noSuffix
      description="One-on-one maths and physics tutoring for Years 7–12 and the HSC. Every tutor interviewed, ID-checked and WWCC-verified. Sydney in-home and online across Australia. First lesson guaranteed."
      path="/"
      ogTitle="The right tutor, matched to your child."
      ogSubtitle="Maths and physics, Years 7–12 and the HSC. Sydney in-home and online."
      jsonLd={[agencyOrganizationSchema(), tutoringServiceSchema('all'), agencyFaqSchema()]}
    >
      <Hero
        heading={<>The right tutor,<br className="hidden sm:block" /> matched to your child.</>}
        lead="One-on-one maths and physics tutoring across Sydney and online, Years 7 to 12 and the HSC. Every Crestio tutor is interviewed, ID-checked and WWCC-verified before they meet your child."
      />
      <HowItWorks />
      <SubjectGrid />
      <WhyCrestio />
      <PricingSummary />
      <TutorBand />
      <ReviewsBand />
      <FaqList />
      <FinalBand />
    </AgencyPage>
  );
}
