import { useEffect, useState } from 'react';

export type CourseCardMetric = 'curriculum' | 'coverage' | 'today';

const KEY = 'lacuna.courseCardMetric';
const VALID_METRICS: CourseCardMetric[] = ['curriculum', 'coverage', 'today'];

export function readCourseCardMetric(): CourseCardMetric {
  const raw = localStorage.getItem(KEY);
  return raw && (VALID_METRICS as string[]).includes(raw)
    ? (raw as CourseCardMetric)
    : 'curriculum';
}

export function writeCourseCardMetric(metric: CourseCardMetric): void {
  localStorage.setItem(KEY, metric);
  window.dispatchEvent(new CustomEvent('lacuna:course-card-metric', { detail: metric }));
}

export function useCourseCardMetric(): [CourseCardMetric, (metric: CourseCardMetric) => void] {
  const [metric, setMetric] = useState<CourseCardMetric>(() => readCourseCardMetric());

  useEffect(() => {
    const onChange = () => setMetric(readCourseCardMetric());
    window.addEventListener('storage', onChange);
    window.addEventListener('lacuna:course-card-metric', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('lacuna:course-card-metric', onChange);
    };
  }, []);

  return [
    metric,
    (next) => {
      writeCourseCardMetric(next);
      setMetric(next);
    },
  ];
}
