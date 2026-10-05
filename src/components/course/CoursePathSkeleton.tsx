import { COURSE_PAGE_FRAME } from './coursePageLayout';
import { Skeleton } from '../ui/Skeleton';
import { SectionCard } from '../ui/SectionCard';

export function CoursePathSkeleton() {
  return (
    <div className={`${COURSE_PAGE_FRAME} py-8`}>
      <Skeleton className="mb-6 h-4 w-24" />
      <SectionCard as="div" className="mb-10 md:p-8">
        <Skeleton className="mb-1 h-3 w-40" />
        <Skeleton className="mb-5 h-10 w-64 md:w-80" />
        <div className="flex flex-wrap gap-8">
          <div>
            <Skeleton className="mb-1 h-2.5 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div>
            <Skeleton className="mb-1 h-2.5 w-16" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div>
            <Skeleton className="mb-1 h-2.5 w-16" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      </SectionCard>
      <div className="flex flex-col items-center">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center">
            <Skeleton className="h-14 w-14 rounded-full" />
            <Skeleton className="mt-2 h-3 w-16" />
            {i < 3 && <Skeleton className="my-1 h-8 w-1 rounded-full" />}
          </div>
        ))}
      </div>
    </div>
  );
}
