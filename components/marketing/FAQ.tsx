import Head from 'next/head';
import { useTranslation } from 'react-i18next';
import FaqItem from './FaqItem';
import { faqSchema } from '../../lib/schemaOrg';

const QUESTIONS = ['ai', 'wrong_polish', 'pay_optional', 'fees', 'export', 'parent_account', 'shutdown', 'data'] as const;

type Props = {
  questions?: readonly string[];
  heading?: string;
  prefix?: string;
};

export default function FAQ({ questions = QUESTIONS, heading, prefix = 'faq_v2' }: Props) {
  const { t } = useTranslation('marketing');

  const qas = questions.map((q) => ({
    q: t(`${prefix}.${q}.q`),
    a: t(`${prefix}.${q}.a`),
  }));

  return (
    <>
      <Head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(qas)) }}
        />
      </Head>
      <section className="px-6 md:px-12 py-20 md:py-28 max-w-3xl mx-auto">
        <div className="text-center mb-12 md:mb-14">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">
            {t(`${prefix}.eyebrow`)}
          </div>
          <h2 className="font-display text-3xl md:text-4xl tracking-tighter text-ink text-balance">
            {heading ?? t(`${prefix}.heading`)}
          </h2>
        </div>
        <div className="border-t border-rule">
          {qas.map((qa, i) => (
            <FaqItem key={questions[i] as string} question={qa.q}>
              {qa.a}
            </FaqItem>
          ))}
        </div>
      </section>
    </>
  );
}
