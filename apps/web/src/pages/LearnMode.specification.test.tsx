import 'fake-indexeddb/auto';
import { resetLearnModeFixtures } from './LearnMode.testFixtures';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { createCourse, createLesson, createSequence, cardsForSequence } from '../db/repository';
import { db } from '../db/schema';
import { setConceptSpecificationPoints } from '../questions/repository';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../specifications/paperFixture.testFixtures';
import { ThemeProvider } from '../state/ThemeContext';
import { AccentProvider } from '../state/AccentContext';
import { ToastProvider } from '../components/ui/Toast';
import { LearnMode } from './LearnMode';

beforeEach(resetLearnModeFixtures);

it('hands off ten scoped sequence reviews despite the Simple preference, without changing that preference', async () => {
  const course = await createCourse('Scoped sequence', {
    learnFirst: false,
    unlockMode: 'open',
    specificationData: paperSpecification,
    specificationRef: paperSpecificationReference,
  });
  const lesson = await createLesson(course.id, 'Sequence');
  const sequence = await createSequence(
    course.id,
    lesson.id,
    'Eleven lines',
    Array.from({ length: 11 }, (_, index) => ({ id: `line-${index}`, value: `Line ${index}` })),
    { mode: 'lines' },
  );
  const cards = await cardsForSequence(sequence);
  for (const card of cards)
    await setConceptSpecificationPoints(card.conceptId, ['example-science:cells']);
  localStorage.setItem('lacuna.studyMode', 'simple');
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
                mode: 'curricular',
                specificationPointId: 'example-science:cells',
                reviewLimit: 10,
              }}
              onStepFinished={onStepFinished}
            />
          </MemoryRouter>
        </ToastProvider>
      </AccentProvider>
    </ThemeProvider>,
  );
  for (let index = 0; index < 10; index += 1) {
    fireEvent.click(await screen.findByRole('button', { name: /^Check$/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Continue$/ }));
    await waitFor(async () => expect(await db.reviewHistory.count()).toBe(index + 1));
  }
  await waitFor(() => expect(onStepFinished).toHaveBeenCalledTimes(1));
  expect(onStepFinished.mock.calls[0][0]).toMatchObject({
    blockComplete: true,
    reachedGoal: false,
    simpleMode: false,
  });
  expect(onStepFinished.mock.calls[0][0].events).toHaveLength(10);
  expect(await db.reviewHistory.count()).toBe(10);
  expect(localStorage.getItem('lacuna.studyMode')).toBe('simple');
});
