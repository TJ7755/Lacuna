import { useEffect, useRef, type ReactNode } from 'react';
import { AppLink as Link } from '../ui/AppLink';
import { Button, buttonClassName } from '../ui/Button';
import { PageLoading } from '../ui/PageLoadingBoundary';
import { SectionCard } from '../ui/SectionCard';

export function QuestionSetLoading() {
  return <PageLoading />;
}

export function QuestionSetUnavailable({
  title,
  children,
  backTo,
  backLabel = 'Back to Questions',
  detail,
  onRetry,
}: {
  title: string;
  children: ReactNode;
  backTo: string;
  backLabel?: string;
  detail?: string;
  onRetry?: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (document.activeElement === document.body) heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="qs-editor qs-composer">
      <SectionCard className="mx-auto max-w-2xl space-y-5 p-6 md:p-8">
        <h1
          ref={heading}
          tabIndex={-1}
          className="font-display text-3xl font-semibold shadow-none outline-none"
        >
          {title}
        </h1>
        <p className="text-sm leading-6 text-ink-soft">{children}</p>
        <div className="flex flex-wrap items-center gap-3">
          {onRetry && (
            <Button variant="primary" onClick={onRetry}>
              Try again
            </Button>
          )}
          <Link to={backTo} className={buttonClassName(onRetry ? 'secondary' : 'primary')}>
            {backLabel}
          </Link>
        </div>
        {detail && (
          <details className="text-sm text-ink-soft">
            <summary className="cursor-pointer py-2 font-semibold">Technical details</summary>
            <p className="mt-2 whitespace-pre-wrap break-words">{detail}</p>
          </details>
        )}
      </SectionCard>
    </div>
  );
}
