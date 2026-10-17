import type { LearnModeType } from './types';
import { Skeleton } from '../../components/ui/Skeleton';
import { STUDY_COLUMN, STUDY_HEADER_ROW } from '../../components/learn/studyHeaderLayout';

export function LearnSkeleton({ mode: _mode }: { mode?: LearnModeType }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="bg-paper pt-[env(safe-area-inset-top)]">
        <div className={`${STUDY_HEADER_ROW} gap-2 md:gap-4`}>
          <Skeleton className="h-11 w-11 shrink-0 rounded-full md:w-24" />
          <div className="min-w-10 flex-1">
            <Skeleton className="mb-2 h-3 w-32 max-w-full" />
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <Skeleton className="hidden h-11 w-11 shrink-0 rounded-full md:block" />
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
        </div>
      </header>
      <main
        className={`${STUDY_COLUMN} flex flex-1 flex-col items-center justify-center gap-6 py-6`}
      >
        <div className="w-full rounded-3xl bg-surface px-6 py-16 card-surface md:py-24">
          <Skeleton className="mx-auto h-6 w-3/4" />
          <Skeleton className="mx-auto mt-3 h-6 w-1/2" />
        </div>
        <Skeleton className="h-12 w-48 rounded-full" />
      </main>
    </div>
  );
}
