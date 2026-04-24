import Link from 'next/link';
import Layout from './Layout';

type Props = {
  title?: string;
  description?: string;
};

export default function NotAvailable({
  title = 'Not available',
  description = 'This section is only available to organization owners.',
}: Props) {
  return (
    <Layout subtitle="Access" title={title}>
      <div className="card p-8 max-w-lg">
        <p className="text-sm text-ink-muted mb-5 leading-relaxed">{description}</p>
        <Link href="/app" className="btn-secondary">Back to overview</Link>
      </div>
    </Layout>
  );
}
