import { useRouter } from 'next/router';
import { AgencyPage } from '../../components/agency/AgencyPage';
import { ReviewForm } from '../../components/agency/ReviewForm';
import { REVIEW_COPY } from '../../lib/reviewCopy';

// A family's private review page. The link arrives by email after a few
// lessons (lib/reviews.ts). Never indexed; the token is the only way in.
export default function ReviewPage() {
  const router = useRouter();
  const token = typeof router.query.token === 'string' ? router.query.token : '';
  return (
    <AgencyPage
      title="Your review"
      description="Tell us, in your own words, how tutoring with Crestio is going. Shown on the site only with your permission."
      path="/review"
      noIndex
    >
      <section className="px-6 md:px-12 pt-12 md:pt-16 pb-16 md:pb-24 max-w-3xl mx-auto">
        {token ? <ReviewForm token={token} /> : <h1 className="font-display text-4xl md:text-5xl tracking-tighter text-ink leading-[1.05]">{REVIEW_COPY.en.title}</h1>}
      </section>
    </AgencyPage>
  );
}
