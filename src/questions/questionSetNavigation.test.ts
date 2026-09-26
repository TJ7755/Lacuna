import { describe, expect, it } from 'vitest';
import { questionSetReturn } from './questionSetNavigation';

describe('questionSetReturn', () => {
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
