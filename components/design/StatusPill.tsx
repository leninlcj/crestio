import { ReactNode } from 'react';

type Tone = 'neutral' | 'forest' | 'success' | 'amber' | 'claret' | 'rust';

type Props = {
  tone?: Tone;
  children: ReactNode;
};

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'pill-neutral',
  forest: 'pill-forest',
  success: 'pill-success',
  amber: 'pill-amber',
  claret: 'pill-claret',
  rust: 'pill-rust',
};

export function StatusPill({ tone = 'neutral', children }: Props) {
  return <span className={TONE_CLASS[tone]}>{children}</span>;
}

export default StatusPill;
