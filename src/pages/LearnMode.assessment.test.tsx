import 'fake-indexeddb/auto';
import {
  answerYes,
  findStudyFaceText,
  queryStudyFaceText,
  storedReviewsForCard,
  resetLearnModeFixtures,
} from './LearnMode.testFixtures';
import { LearnMode } from './LearnMode';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { db } from '../db/schema';
import {
  createCourse,
  createCourseAssessment,
  createLesson,
  createLessonCard,
  upsertLessonCardExposure,
} from '../db/repository';
import { createOrResumeRevisionPlan } from '../db/revisionPlanRepository';
import { ToastProvider } from '../components/ui/Toast';
import { ThemeProvider } from '../state/ThemeContext';
import { AccentProvider } from '../state/AccentContext';
describe('LearnMode assessment', () => {
  beforeEach(resetLearnModeFixtures);

  it('ignores the retired mode=cram query entry', async () => {
    const course = await createCourse('Classics');
    const lesson = await createLesson(course.id, 'Athens');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Agora', 'Market');
    await upsertLessonCardExposure(lesson.id, card.id);

    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={[`/course/${course.id}/learn?mode=cram`]}>
              <Routes>
                <Route path="/course/:courseId/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText(/Classics/)).toBeInTheDocument();
    expect(screen.queryByText(/Cram mode|Weakest cards first/)).not.toBeInTheDocument();
  });

  it('uses the selected assessment scope in the ordinary Practice player', async () => {
    const course = await createCourse('History');
    const includedLesson = await createLesson(course.id, 'Revolutions');
    const unrelatedLesson = await createLesson(course.id, 'Empires');
    const included = await createLessonCard(
      course.id,
      includedLesson.id,
      'front_back',
      'Assessment question',
      'Answer',
    );
    const unrelated = await createLessonCard(
      course.id,
      unrelatedLesson.id,
      'front_back',
      'Unrelated question',
      'Answer',
    );
    await Promise.all([
      upsertLessonCardExposure(includedLesson.id, included.id),
      upsertLessonCardExposure(unrelatedLesson.id, unrelated.id),
    ]);
    const assessment = await createCourseAssessment(
      course.id,
      'Revolutions paper',
      Date.now() + 86_400_000,
      {
        afterLessonId: unrelatedLesson.id,
        coverageMode: 'custom',
        lessonIds: [includedLesson.id],
      },
    );

    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter>
              <LearnMode
                sessionId="flow-session-1"
                request={{
                  kind: 'practice',
                  courseId: course.id,
                  mode: 'assessment',
                  assessmentId: assessment.id,
                }}
              />
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText('Revolutions paper')).toBeInTheDocument();
    expect(await findStudyFaceText(/Assessment question/)).toBeInTheDocument();
    expect(queryStudyFaceText(/Unrelated question/)).toBeUndefined();

    await answerYes();
    await waitFor(async () => {
      const [review] = await storedReviewsForCard(included.id);
      expect(review).toEqual(
        expect.objectContaining({
          eventId: expect.any(String),
          sessionId: 'flow-session-1',
          sessionKind: 'assessment-revision',
          correct: true,
        }),
      );
      expect(await db.sessionHistory.toArray()).toEqual([
        expect.objectContaining({
          eventId: review?.eventId,
          sessionId: 'flow-session-1',
        }),
      ]);
    });
  });

  it('runs a persisted assessment window through the existing player with provenance and a factual summary', async () => {
    const course = await createCourse('Geography');
    const lesson = await createLesson(course.id, 'Rivers');
    const card = await createLessonCard(
      course.id,
      lesson.id,
      'front_back',
      'What is erosion?',
      'Wear',
    );
    await upsertLessonCardExposure(lesson.id, card.id);
    const assessment = await createCourseAssessment(
      course.id,
      'Physical geography',
      Date.now() + 86_400_000,
      { afterLessonId: lesson.id, coverageMode: 'prefix' },
    );
    const plan = await createOrResumeRevisionPlan(assessment.id, 20, {
      projectionMode: 'fsrs-6-practice-fallback',
      memoryModelVersion: 'fsrs-6',
      fallbackReason: 'missing',
    });
    const onStepFinished = vi.fn();

    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter>
              <LearnMode
                sessionId="revision-session-1"
                request={{
                  kind: 'practice',
                  courseId: course.id,
                  mode: 'assessment',
                  assessmentId: assessment.id,
                  planId: plan.id,
                  windowId: plan.windows[0].id,
                }}
                onStepFinished={onStepFinished}
              />
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByRole('heading', { name: /Revision plan/ })).toBeInTheDocument();
    expect(screen.queryByText(/Ordinary Practice ordering/)).not.toBeInTheDocument();
    expect(await findStudyFaceText(/What is erosion/)).toBeInTheDocument();
    await answerYes();

    await waitFor(() => expect(onStepFinished).toHaveBeenCalledOnce());
    expect(onStepFinished.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        reachedGoal: true,
        revision: expect.objectContaining({
          cardsCovered: 1,
          cardsImproved: 1,
          workNotReached: 0,
        }),
      }),
    );
    const reviews = await storedReviewsForCard(card.id);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toEqual(
      expect.objectContaining({
        sessionId: 'revision-session-1',
        revisionPlanId: plan.id,
        revisionWindowId: plan.windows[0].id,
      }),
    );
    const storedPlan = await db.revisionPlans.get(plan.id);
    expect(storedPlan?.completedSessions[0]).toEqual(
      expect.objectContaining({
        cardIds: [card.id],
        improvedCardIds: [card.id],
        reviewEventIds: [reviews[0].eventId],
      }),
    );
    expect(await db.practiceMilestones.count()).toBe(0);
  });

  it('parks a failed card when its productive FSRS retry falls outside the active window', async () => {
    const course = await createCourse('French');
    const lesson = await createLesson(course.id, 'Vocabulary');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'bonjour', 'hello');
    await upsertLessonCardExposure(lesson.id, card.id);
    const assessment = await createCourseAssessment(
      course.id,
      'Speaking',
      Date.now() + 86_400_000,
      {
        afterLessonId: lesson.id,
        coverageMode: 'prefix',
      },
    );
    const plan = await createOrResumeRevisionPlan(assessment.id, 0.1, {
      projectionMode: 'fsrs-6-practice-fallback',
      memoryModelVersion: 'fsrs-6',
      fallbackReason: 'missing',
    });
    const onStepFinished = vi.fn();
    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter>
              <LearnMode
                request={{
                  kind: 'practice',
                  courseId: course.id,
                  mode: 'assessment',
                  assessmentId: assessment.id,
                  planId: plan.id,
                  windowId: plan.windows[0].id,
                }}
                onStepFinished={onStepFinished}
              />
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );

    const revealCandidates = await screen.findAllByRole('button', { name: /show answer/i });
    fireEvent.click(revealCandidates.find((element) => element.tagName === 'BUTTON')!);
    expect(await findStudyFaceText('hello')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^no$/i }));

    await waitFor(() => expect(onStepFinished).toHaveBeenCalledOnce());
    expect(onStepFinished.mock.calls[0][0].revision).toEqual(
      expect.objectContaining({ cardsCovered: 1, cardsImproved: 0, cardsParked: 1 }),
    );
    expect((await db.revisionPlans.get(plan.id))?.completedSessions[0].parkedCardIds).toEqual([
      card.id,
    ]);
  });
});
