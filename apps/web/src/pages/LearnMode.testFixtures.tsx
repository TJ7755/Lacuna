import 'fake-indexeddb/auto';
import { vi } from 'vitest';
import { act, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { db } from '../db/schema';
import type * as MotionSpeedModule from '../state/motionSpeed';

// These session tests freeze response-time clocks; motion itself is covered by
// StudyCardTransition and the browser interaction regressions.
vi.mock('../state/motionSpeed', async (importOriginal) => ({
  ...(await importOriginal<typeof MotionSpeedModule>()),
  speedMultiplier: () => 0,
}));
/**
 * Reveal and answer "Yes" via the silent-mode buttons (the default grading mode).
 * The FlipCard wrapper itself also carries an aria-label of "Show answer" (for
 * tap-to-flip), so the actual <button> element is picked out explicitly.
 */
export async function answerYes() {
  fireEvent.click(await screen.findByText(/^show answer$/i, { selector: 'button' }));
  fireEvent.click(await screen.findByRole('button', { name: /^yes$/i }));
}
export async function answerNo() {
  fireEvent.click(await screen.findByText(/^show answer$/i, { selector: 'button' }));
  fireEvent.click(await screen.findByRole('button', { name: /^no$/i }));
}
export async function answerYesAndWaitForExposure(lessonId: string) {
  fireEvent.click(await screen.findByText(/^show answer$/i, { selector: 'button' }));
  const yes = await screen.findByRole('button', { name: /^yes$/i });
  await act(async () => {
    fireEvent.click(yes);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if ((await db.lessonCardExposures.where('lessonId').equals(lessonId).count()) === 1) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });
}
/** Leaves the notes screen; a lesson without notes opens on its first card instead. */
export async function continueFromNotes() {
  const next = await screen.findAllByRole('button', { name: /^(continue|show answer|recite)$/i });
  const notesContinue = next.find((button) => /^continue$/i.test(button.textContent ?? ''));
  if (notesContinue) fireEvent.click(notesContinue);
}
export function studyFaceText(text: string | RegExp) {
  const matches = [...document.querySelectorAll<HTMLElement>('[data-study-face]')].flatMap((face) =>
    within(face).queryAllByText(text),
  );
  if (matches.length !== 1) {
    throw new Error(`Expected one visible study-face match, found ${matches.length}`);
  }
  return matches[0];
}
export async function findStudyFaceText(text: string | RegExp) {
  return waitFor(() => studyFaceText(text));
}
export function queryStudyFaceText(text: string | RegExp) {
  return [...document.querySelectorAll<HTMLElement>('[data-study-face]')].find((face) =>
    within(face).queryByText(text),
  );
}
export async function storedReviewsForCard(cardId: string) {
  return db.reviewHistory.where('cardId').equals(cardId).sortBy('timestamp');
}
export async function resetLearnModeFixtures() {
  await Promise.all([
    db.courses.clear(),
    db.lessons.clear(),
    db.cards.clear(),
    db.schedulingUnits.clear(),
    db.sessionHistory.clear(),
    db.userPerformance.clear(),
    db.lessonCards.clear(),
    db.lessonCardExposures.clear(),
    db.lessonCompletions.clear(),
    db.practiceNodes.clear(),
    db.practiceMilestones.clear(),
    db.courseAssessments.clear(),
    db.revisionPlans.clear(),
    db.noteAnnotations.clear(),
    db.sequences.clear(),
    db.reviewHistory.clear(),
  ]);
  localStorage.clear();
}
