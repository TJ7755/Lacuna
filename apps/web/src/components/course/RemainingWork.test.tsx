import 'fake-indexeddb/auto';
import { Component, type ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCourse, createLesson, createLessonCard } from '../../db/repository';
import { db } from '../../db/schema';
import { hydrateCardsWithHistory } from '../../db/reviewHistoryRead';
import { reviewHistoryEntryForCard } from '@lacuna/core/db/reviewHistory';
import { calculateRemainingWork, type RemainingWorkRecords } from '../../course/remainingWorkData';
import { calculateRemainingWorkOffThread } from '../../course/remainingWorkWorker';
import { RemainingWork } from './RemainingWork';

vi.mock('../../course/remainingWorkWorker', () => ({
  calculateRemainingWorkOffThread: vi.fn(async () => []),
}));

class FailureBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <p role="alert">{this.state.error.message}</p> : this.props.children;
  }
}

beforeEach(async () => {
  vi.clearAllMocks();
  await Promise.all(db.tables.map((table) => table.clear()));
});
afterEach(() => vi.restoreAllMocks());

async function fixture() {
  const course = await createCourse('Assessment estimates');
  const lesson = await createLesson(course.id, 'Cells');
  const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Cell', 'Answer');
  const assessments = await db.courseAssessments.where('courseId').equals(course.id).toArray();
  const records: RemainingWorkRecords = {
    course,
    lessons: [lesson],
    cards: [card],
    assessments,
    links: [],
  };
  return { card, records };
}

it('runs supplied Path records through the background estimator', async () => {
  const { records } = await fixture();
  render(<RemainingWork courseId={records.course!.id} records={records} />);
  await waitFor(() =>
    expect(calculateRemainingWorkOffThread).toHaveBeenCalledWith(
      { source: records, plans: [] },
      expect.any(Number),
      expect.any(AbortSignal),
    ),
  );
});

it('aborts its pending estimator when the course unmounts', async () => {
  const { card, records } = await fixture();
  let signal: AbortSignal | undefined;
  vi.mocked(calculateRemainingWorkOffThread).mockImplementationOnce(
    (_input, _now, supplied?: AbortSignal) => {
      signal = supplied;
      return new Promise((resolve) =>
        supplied?.addEventListener('abort', () => resolve([]), { once: true }),
      );
    },
  );
  const page = render(<RemainingWork courseId={card.courseId!} records={records} />);
  await waitFor(() => expect(calculateRemainingWorkOffThread).toHaveBeenCalled());
  page.unmount();
  expect(signal?.aborted).toBe(true);
});

it('does not start the main-thread fallback after an unmounted worker rejects', async () => {
  const { card, records } = await fixture();
  let fail!: (cause: unknown) => void;
  vi.mocked(calculateRemainingWorkOffThread).mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  const fallback = vi.spyOn(
    await import('../../course/remainingWorkData'),
    'calculateRemainingWork',
  );
  const page = render(<RemainingWork courseId={card.courseId!} records={records} />);
  await waitFor(() => expect(calculateRemainingWorkOffThread).toHaveBeenCalled());
  page.unmount();
  await act(async () => {
    fail(new DOMException('Cancelled', 'AbortError'));
  });
  expect(fallback).not.toHaveBeenCalled();
});

it.each(['rejection', 'construction throw'] as const)(
  'recovers workload estimates when the offline worker fails through %s',
  async (failure) => {
    const { card, records } = await fixture();
    await db.reviewHistory.add(
      reviewHistoryEntryForCard(card, {
        eventId: 'offline-review',
        timestamp: Date.now() - 100,
        grade: 3,
        responseTimeSec: 90,
        distracted: false,
        stabilityBefore: null,
        stabilityAfter: 2,
        difficultyBefore: null,
        difficultyAfter: 5,
        retrievabilityAtReview: null,
      }),
    );
    const unavailable = new Error('Offline worker asset');
    if (failure === 'rejection')
      vi.mocked(calculateRemainingWorkOffThread).mockRejectedValueOnce(unavailable);
    else
      vi.mocked(calculateRemainingWorkOffThread).mockImplementationOnce(() => {
        throw unavailable;
      });
    render(
      <FailureBoundary>
        <RemainingWork courseId={card.courseId!} records={records} />
      </FailureBoundary>,
    );
    await waitFor(() => expect(calculateRemainingWorkOffThread).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await screen.findByText(/Allow around 2 minutes in total/);
    expect(screen.getByText(/Uses your recorded review times/)).toBeInTheDocument();
  },
);

it('keeps the same estimates as full card histories when events have historical course ownership', async () => {
  const { card, records } = await fixture();
  const now = Date.now();
  await db.reviewHistory.add({
    ...reviewHistoryEntryForCard(card, {
      eventId: 'historical-review',
      timestamp: now - 100,
      grade: 3,
      responseTimeSec: 90,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 2,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    }),
    courseId: 'previous-course',
  });
  const expected = await calculateRemainingWork(
    {
      source: { ...records, cards: await hydrateCardsWithHistory(records.cards) },
      plans: [],
    },
    now,
    false,
  );
  expect(expected[0].estimate.usesDefaultTiming).toBe(false);
  await expect(calculateRemainingWork({ source: records, plans: [] }, now, true)).resolves.toEqual(
    expected,
  );
});
