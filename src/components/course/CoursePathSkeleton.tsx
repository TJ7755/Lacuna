import { COURSE_PAGE_FRAME } from './coursePageLayout';

export function CoursePathSkeleton() {
  return (
    <div className={`${COURSE_PAGE_FRAME} py-8`}>
      <div className="mb-6 h-4 w-24 animate-pulse rounded bg-ink/10" />
      <div className="mb-10 rounded-2xl border border-line bg-surface p-6 md:p-8">
        <div className="mb-1 h-3 w-40 animate-pulse rounded bg-ink/10" />
        <div className="mb-5 h-10 w-64 animate-pulse rounded bg-ink/10 md:w-80" />
        <div className="flex flex-wrap gap-8">
          <div>
            <div className="mb-1 h-2.5 w-28 animate-pulse rounded bg-ink/10" />
            <div className="h-4 w-20 animate-pulse rounded bg-ink/10" />
          </div>
          <div>
            <div className="mb-1 h-2.5 w-16 animate-pulse rounded bg-ink/10" />
            <div className="h-4 w-12 animate-pulse rounded bg-ink/10" />
          </div>
          <div>
            <div className="mb-1 h-2.5 w-16 animate-pulse rounded bg-ink/10" />
            <div className="h-4 w-16 animate-pulse rounded bg-ink/10" />
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className="h-14 w-14 animate-pulse rounded-full bg-ink/10" />
            <div className="mt-2 h-3 w-16 animate-pulse rounded bg-ink/10" />
            {i < 3 && <div className="my-1 h-8 w-1 animate-pulse rounded-full bg-ink/10" />}
          </div>
        ))}
      </div>
    </div>
  );
}
