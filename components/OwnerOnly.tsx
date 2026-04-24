import { ReactNode } from 'react';
import { useMembership } from '../lib/membershipContext';
import NotAvailable from './NotAvailable';

export default function OwnerOnly({ children }: { children: ReactNode }) {
  const { membership, loading } = useMembership();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="text-ink-muted text-sm tracking-widest uppercase">Loading</div>
      </div>
    );
  }
  if (!membership || membership.role !== 'owner') {
    return <NotAvailable />;
  }
  return <>{children}</>;
}
