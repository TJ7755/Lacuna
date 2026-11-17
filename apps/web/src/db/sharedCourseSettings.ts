import { clampRequestRetention, defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import type { CreateCourseOptions } from './courseRepository';
import type { ShareCourse } from './sharePayload';

export function decodeSharedCourseSettings(course: ShareCourse): {
  name: string;
  options: CreateCourseOptions;
} {
  return {
    name: course.n || 'Shared course',
    options: {
      description: course.d ?? '',
      ...(course.specificationRef === undefined
        ? {}
        : { specificationRef: course.specificationRef }),
      ...(course.specificationData === undefined
        ? {}
        : { specificationData: course.specificationData }),
      ...(course.techniques === undefined ? {} : { techniques: course.techniques }),
      ...(course.examBoard === undefined ? {} : { examBoard: course.examBoard }),
      ...(course.specification === undefined ? {} : { specification: course.specification }),
      examObjective: course.o === 1 ? 'securedTopics' : 'expectedMarks',
      createdAt: course.c,
      schedulingMode: course.sm === 1 ? 'steady' : 'exam',
      ...(course.e === undefined ? {} : { examDate: course.e }),
      fsrsParameters: {
        ...defaultFsrsParameters(),
        ...(typeof course.r === 'number'
          ? { requestRetention: clampRequestRetention(course.r) }
          : {}),
      },
      ...(course.p && course.p > 0 ? { newCardsPerDay: course.p } : {}),
      ...(course.lf === 0 ? { learnFirst: false } : {}),
      ...(course.l ? { colour: course.l } : {}),
      unlockMode: course.um,
    },
  };
}
