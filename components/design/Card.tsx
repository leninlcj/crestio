import { HTMLAttributes, ReactNode } from 'react';

type Props = HTMLAttributes<HTMLDivElement> & {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  as?: 'div' | 'section' | 'article';
  children: ReactNode;
};

const PADDING: Record<NonNullable<Props['padding']>, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({
  padding = 'md',
  as: Tag = 'div',
  className,
  children,
  ...rest
}: Props) {
  return (
    <Tag className={['card', PADDING[padding], className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  );
}

export default Card;
