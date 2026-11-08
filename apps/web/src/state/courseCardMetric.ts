import { createLocalSetting, oneOf } from './localSetting';

export type CourseCardMetric = 'curriculum' | 'coverage' | 'today';

const setting = createLocalSetting<CourseCardMetric>({
  key: 'lacuna.courseCardMetric',
  event: 'lacuna:course-card-metric',
  parse: oneOf(['curriculum', 'coverage', 'today'], 'curriculum'),
});

export const useCourseCardMetric = setting.use;
