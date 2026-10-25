import { vi } from 'vitest';
import type { DistractionTracker } from '../../components/learn/useDistraction';
import type { CardFilter } from '../../db/search';
import { db } from '../../db/schema';
import type { UseLearnSessionParams } from './useLearnSession';

export const distraction: DistractionTracker = {
  beginCard: vi.fn(),
  setAnswerVisible: vi.fn(),
  wasDistracted: () => false,
  blurredMs: () => 0,
  sessionMs: () => 1,
};

// Stable empty filters. An inline `[]` on every render is the same object-identity
// landmine as a rebuilt `scopeLessonIds` array and would reload the session forever.
const emptyFilterParams: CardFilter[] = [];

export function sessionParams(
  overrides: Partial<UseLearnSessionParams> = {},
): UseLearnSessionParams {
  return {
    courseId: undefined,
    lessonId: undefined,
    sessionId: undefined,
    tagFilter: null,
    filterParams: emptyFilterParams,
    requestScopeLessonIds: undefined,
    practiceNodeKeyParam: null,
    requestAssessmentId: undefined,
    requestPlanId: undefined,
    requestWindowId: undefined,
    plannedRevision: false,
    reviewSessionKind: 'practice',
    isSimpleMode: false,
    mode: 'fsrs',
    navigate: vi.fn(),
    notify: vi.fn(),
    distraction,
    ...overrides,
  };
}

export async function resetSessionTestDatabase() {
  localStorage.removeItem('lacuna.answerInput');
  await Promise.all([
    db.cards.clear(),
    db.schedulingUnits.clear(),
    db.sessionHistory.clear(),
    db.userPerformance.clear(),
    db.coursePerformance.clear(),
    db.schedulingUnits.clear(),
    db.schedulingPerformance.clear(),
    db.reviewHistory.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.lessonCards.clear(),
    db.lessonCardExposures.clear(),
    db.courseAssessments.clear(),
  ]);
}
