import { COURSE_PAGE_FRAME, COURSE_PAGE_HEADER } from './coursePageLayout';
import { Skeleton } from '../ui/Skeleton';
import { SectionCard } from '../ui/SectionCard';

export function CoursePathSkeleton() {
  return (
    <div className={`${COURSE_PAGE_FRAME} pb-12`}>
      <header data-page-part="" className={COURSE_PAGE_HEADER}>
        <Skeleton className="h-11 w-80 max-w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-12 w-28 rounded-full" />
          <Skeleton className="h-12 w-32 rounded-full" />
        </div>
      </header>
      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[2_1_520px] space-y-6">
          <SectionCard data-page-part="">
            <Skeleton className="mb-4 h-6 w-32" />
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-[18px] px-3 py-3.5">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="mb-2 h-4 w-3/4" />
                  <Skeleton className="h-1 w-full rounded-full" />
                </div>
              </div>
            ))}
          </SectionCard>
          <SectionCard data-page-part="" className="flex gap-8">
            {[0, 1, 2].map((key) => (
              <div key={key} className="min-w-0 flex-1">
                <Skeleton className="mb-2 h-7 w-12" />
                <Skeleton className="h-3 w-full max-w-28" />
              </div>
            ))}
          </SectionCard>
        </div>
        <SectionCard data-page-part="" className="min-w-0 flex-[1_1_300px]">
          <Skeleton className="mb-6 h-6 w-36" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-9" />
            <div className="flex-1">
              <Skeleton className="mb-3 h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
