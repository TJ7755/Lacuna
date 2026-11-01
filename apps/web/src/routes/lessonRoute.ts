export const loadLessonView = () =>
  import('../pages/LessonView').then((module) => ({ default: module.LessonView }));
