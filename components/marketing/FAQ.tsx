import { useTranslation } from 'react-i18next';
import FaqItem from './FaqItem';

const QUESTIONS = ['ai', 'wrong_polish', 'pay_optional', 'fees', 'export', 'parent_account', 'shutdown', 'data'] as const;

type Props = {
  questions?: readonly string[];
  heading?: string;
  prefix?: string;
};

export default function FAQ({ questions = QUESTIONS, heading, prefix = 'faq_v2' }: Props) {
  const { t } = useTranslation('marketing');

  return (
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
        {questions.map((q) => (
          <FaqItem key={q} question={t(`${prefix}.${q}.q`)}>
            {t(`${prefix}.${q}.a`)}
          </FaqItem>
        ))}
      </div>
    </section>
  );
}
