import { cn } from '../../components/ui/cn';
import type { LearnModeType } from './types';

export function LearnSkeleton({ mode }: { mode?: LearnModeType }) {
  const borderClass =
    mode === 'cram'
      ? 'border-warning/30'
      : mode === 'simple'
        ? 'border-positive/30'
        : 'border-line';
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className={cn('sticky top-0 z-10 border-b bg-paper/85 backdrop-blur', borderClass)}>
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-3">
          <div className="h-11 w-11 animate-pulse rounded-lg bg-ink/10" />
          <div className="min-w-0 flex-1">
            <div className="mb-1 h-3 w-32 animate-pulse rounded bg-ink/10" />
            <div className="h-1.5 w-full animate-pulse rounded-full bg-ink/10" />
          </div>
          <div className="h-11 w-11 animate-pulse rounded-lg bg-ink/10" />
          <div className="h-9 w-16 animate-pulse rounded-lg bg-ink/10" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full rounded-3xl border border-line bg-surface px-6 py-10">
            <div className="mx-auto mb-4 h-3 w-20 animate-pulse rounded bg-ink/10" />
            <div className="mx-auto h-6 w-3/4 animate-pulse rounded bg-ink/10" />
          </div>
        </div>
        <div className="mt-8 flex flex-col items-center gap-2">
          <div className="h-12 w-full max-w-sm animate-pulse rounded-lg bg-ink/10" />
        </div>
      </main>
    </div>
  );
}
