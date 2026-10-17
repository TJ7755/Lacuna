import type { ReactNode } from 'react';
import { AppLink } from '../ui/AppLink';
import { buttonClassName } from '../ui/buttonStyles';
import { SectionCard } from '../ui/SectionCard';
import { COURSE_PAGE_FRAME } from './coursePageLayout';

export function MissingRecord({
  message,
  to,
  children,
}: {
  message: string;
  to: string;
  children: ReactNode;
}) {
  return (
    <div className={`${COURSE_PAGE_FRAME} py-6 md:py-8`}>
      <SectionCard>
        <h1 className="mb-5 font-display text-xl text-ink">{message}</h1>
        <AppLink to={to} className={buttonClassName('secondary', 'sm')}>
          {children}
        </AppLink>
      </SectionCard>
    </div>
  );
}
