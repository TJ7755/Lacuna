import { COURSE_PAGE_FRAME } from './coursePageLayout';
import { Skeleton } from '../ui/Skeleton';

export function LessonViewSkeleton() {
  return (
    <div className={`${COURSE_PAGE_FRAME} py-8`}>
      <Skeleton className="mb-6 h-11 w-24 rounded-full bg-ink/10" />
      <div data-page-part="" className="mb-6 flex flex-col gap-3">
        <Skeleton className="h-11 w-72 max-w-full rounded-xl bg-ink/10" />
        <Skeleton className="h-4 w-52 rounded bg-ink/10" />
      </div>
      <div data-page-part="" className="flex flex-wrap gap-6">
        <Skeleton className="h-80 flex-[3_1_560px] rounded-3xl bg-ink/[0.06]" />
        <Skeleton className="h-80 flex-[2_1_340px] rounded-3xl bg-ink/[0.06]" />
      </div>
    </div>
  );
}
