import { describe, expect, it } from 'vitest';
import { questionSetReturn } from './questionSetNavigation';

describe('questionSetReturn', () => {
  it('accepts the same-course path root with an optional query only', () => {
    const origin = { questionSetReturnLabel: 'Back to path' };
    expect(questionSetReturn({ ...origin, questionSetReturnTo: '/course/course-1' }, 'course-1')).toEqual({
      ...origin,
      questionSetReturnTo: '/course/course-1',
    });
    expect(
      questionSetReturn(
        { ...origin, questionSetReturnTo: '/course/course-1?tab=questions' },
        'course-1',
      ),
    ).toEqual({
      ...origin,
      questionSetReturnTo: '/course/course-1?tab=questions',
    });
    expect(
      questionSetReturn(
        { ...origin, questionSetReturnTo: '/course/course-1/lesson/lesson-1' },
        'course-1',
      ),
    ).toBeUndefined();
    expect(
      questionSetReturn({ ...origin, questionSetReturnTo: '/course/course-2' }, 'course-1'),
    ).toBeUndefined();
  });

  it('accepts Questions library origins only at the same-course library route', () => {
    const origin = { questionSetReturnLabel: 'Back to Questions' };
    expect(questionSetReturn({ ...origin, questionSetReturnTo: '/course/course-1/questions' }, 'course-1')).toEqual({
      ...origin,
      questionSetReturnTo: '/course/course-1/questions',
    });
    expect(questionSetReturn({ ...origin, questionSetReturnTo: '/course/course-1/questions?search=kinetics' }, 'course-1')).toEqual({
      ...origin,
      questionSetReturnTo: '/course/course-1/questions?search=kinetics',
    });
    expect(questionSetReturn({ ...origin, questionSetReturnTo: '/course/course-1/questions/other' }, 'course-1')).toBeUndefined();
    expect(questionSetReturn({ ...origin, questionSetReturnTo: '/course/course-2/questions' }, 'course-1')).toBeUndefined();
    expect(questionSetReturn({ ...origin, questionSetReturnTo: '/course/course-1/cards' }, 'course-1')).toBeUndefined();
  });

  it('accepts same-course lesson, exam and card origins', () => {
    expect(
      questionSetReturn(
        { questionSetReturnTo: '/course/course-1/lesson/lesson-2?tab=cards', questionSetReturnLabel: 'Back to lesson' },
        'course-1',
      ),
    ).toEqual({
      questionSetReturnTo: '/course/course-1/lesson/lesson-2?tab=cards',
      questionSetReturnLabel: 'Back to lesson',
    });
    expect(
      questionSetReturn(
        { questionSetReturnTo: '/course/course-1/study?assessmentId=exam-1', questionSetReturnLabel: 'Back to exam' },
        'course-1',
      ),
    ).toEqual({
      questionSetReturnTo: '/course/course-1/study?assessmentId=exam-1',
      questionSetReturnLabel: 'Back to exam',
    });
    expect(
      questionSetReturn(
        { questionSetReturnTo: '/course/course-1/cards/card-1', questionSetReturnLabel: 'Back to Cards' },
        'course-1',
      ),
    ).toEqual({
      questionSetReturnTo: '/course/course-1/cards/card-1',
      questionSetReturnLabel: 'Back to Cards',
    });
  });

  it('rejects cross-course, external and malformed origins', () => {
    expect(
      questionSetReturn(
        { questionSetReturnTo: '/course/course-2/lesson/lesson-1', questionSetReturnLabel: 'Back to lesson' },
        'course-1',
      ),
    ).toBeUndefined();
    expect(
      questionSetReturn(
        { questionSetReturnTo: 'https://example.com/course/course-1', questionSetReturnLabel: 'Back to lesson' },
        'course-1',
      ),
    ).toBeUndefined();
    expect(
      questionSetReturn(
        { questionSetReturnTo: '/course/course-1/lesson/lesson-1', questionSetReturnLabel: 'Return' },
        'course-1',
      ),
    ).toBeUndefined();
    expect(questionSetReturn({ questionSetReturnTo: '/course/course-1' }, 'course-1')).toBeUndefined();
    expect(questionSetReturn(null, 'course-1')).toBeUndefined();
  });
});
