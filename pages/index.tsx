import type { GetStaticProps } from 'next';
import { AgencyPage } from '../components/agency/AgencyPage';
import { Hero, HowItWorks, SubjectGrid, WhyCrestio, PricingSummary, TutorBand, ReviewsBand, FaqList, FinalBand, type ReviewCard } from '../components/agency/blocks';
import { agencyOrganizationSchema, tutoringServiceSchema, agencyFaqSchema } from '../lib/agencySchema';
import { loadPublicReviews } from '../lib/publicReviews';

type Props = { reviews: ReviewCard[] };

export default function Home({ reviews }: Props) {
  return (
    <AgencyPage
      title="Maths, science, HSC and IB tutoring in Sydney and online | Crestio Tutoring"
      noSuffix
      description="One-on-one maths and science tutoring for Years 7–12, the HSC and the IB, with other HSC subjects by request. Every tutor interviewed, ID-checked and WWCC-verified. Sydney in-home and online across Australia. Leave your number and the founder calls you back."
      path="/"
      ogTitle="The right tutor, matched to your child."
      ogSubtitle="Maths and science, Years 7–12, HSC and IB. Sydney in-home and online across Australia."
      jsonLd={[agencyOrganizationSchema(), tutoringServiceSchema('all'), agencyFaqSchema()]}
    >
      <Hero
        heading={<>The right tutor,<br className="hidden sm:block" /> matched to your child.</>}
        lead="One-on-one maths and science tutoring for Years 7 to 12, the HSC and the IB, in your home across Sydney or online anywhere in Australia. Every Crestio tutor is interviewed, ID-checked and WWCC-verified before they meet your child."
      />
      <HowItWorks />
      <SubjectGrid />
      <WhyCrestio />
      <PricingSummary />
      <TutorBand />
      <ReviewsBand reviews={reviews} />
      <FaqList />
      <FinalBand />
    </AgencyPage>
  );
}

// Approved reviews are read at build time and refreshed hourly; approving or
// hiding one in the app also revalidates this page straight away.
export const getStaticProps: GetStaticProps<Props> = async () => {
  const reviews = await loadPublicReviews();
  return { props: { reviews }, revalidate: 3600 };
};
