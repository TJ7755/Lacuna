import { cn } from '../../components/ui/cn';
import type { LearnModeType } from './types';
import { Skeleton } from '../../components/ui/Skeleton';

export function LearnSkeleton({ mode }: { mode?: LearnModeType }) {
  const borderClass =
    mode === 'cram'
      ? 'border-warning/30'
      : mode === 'simple'
        ? 'border-positive/30'
        : 'border-line';
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header
        className={cn(
          'sticky top-0 z-10 border-b bg-paper/85 pt-[env(safe-area-inset-top)] backdrop-blur',
          borderClass,
        )}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-4 py-3 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))]">
          <Skeleton className="h-11 w-11 rounded-lg" />
          <div className="min-w-0 flex-1">
            <Skeleton className="mb-1 h-3 w-32" />
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
          <Skeleton className="h-11 w-11 rounded-lg" />
          <Skeleton className="h-9 w-16 rounded-lg" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col py-8 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))]">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full rounded-3xl border border-line bg-surface px-6 py-10">
            <Skeleton className="mx-auto mb-4 h-3 w-20" />
            <Skeleton className="mx-auto h-6 w-3/4" />
          </div>
        </div>
        <div className="mt-8 flex flex-col items-center gap-2">
          <Skeleton className="h-12 w-full max-w-sm rounded-lg" />
        </div>
      </main>
    </div>
  );
}
