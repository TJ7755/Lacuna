import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { SharePayloadV2 } from '../../db/share';
import { db } from '../../db/schema';
import { importLineageFirstTime } from '../../db/mergeImport';
import { updateCourse } from '../../db/courseRepository';
import { CourseSpecificationSection } from '../../pages/settings/CourseSpecificationSection';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../../specifications/paperFixture.testFixtures';
import {
  chooseStudyTarget,
  finishOnboarding,
  markOnboardingPending,
} from '../../onboarding/onboardingState';
import { SharedCourseImport } from './SharedCourseImport';

vi.mock('../ui/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['none'],
  speedMultiplier: () => 0,
}));

function publication(lineageId: string, revision: number): SharePayloadV2 {
  return {
    v: 2,
    at: 1000,
    li: lineageId,
    rv: revision,
    // Identity must come from the publication record, never a title guess.
    course: { n: 'Renamed science selection', o: 0, c: 1000, sm: 1, um: 'open' },
    lessons: [
      {
        i: 'cells',
        n: 'Cells',
        notes: [],
        cards: [{ id: 'cell-card', k: 0, f: 'Cell?', b: 'Answer' }],
      },
    ],
  };
}

function courseFile(payload: SharePayloadV2) {
  return new File(
    [JSON.stringify({ format: 'lacuna-course', version: 1, payload, assets: [] })],
    'Science.lacuna',
  );
}

beforeEach(async () => {
  finishOnboarding();
  markOnboardingPending();
  chooseStudyTarget({ mode: 'steady' });
  await db.delete();
  await db.open();
});

it.each([
  ['aqa-8464', 10, 'AQA', '8464', 'Trilogy'],
  ['edexcel-1bi0', 7, 'Pearson Edexcel', '1BI0', 'Separate Biology'],
])(
  'shows %s identity and unverified tier before import and after reopening',
  async (id, revision, board, code, route) => {
    const source = publication(`tj7755-lacuna-content-2028-${id}-pilot`, revision);
    const onImported = vi.fn();
    const view = render(
      <SharedCourseImport initialFile={courseFile(source)} onImported={onImported} />,
    );
    const add = await screen.findByRole('button', { name: 'Add to my courses' });
    const preview = within(screen.getByRole('region', { name: 'Course identity' }));
    expect(preview.getByText(board, { exact: true })).toBeVisible();
    expect(preview.getByText(code, { exact: true })).toBeVisible();
    expect(preview.getByText(route, { exact: true })).toBeVisible();
    expect(preview.getByText(/Course tier eligibility is unverified/)).toBeVisible();
    expect(preview.getByRole('link', { name: 'Awarding body specification' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^https:\/\//),
    );
    fireEvent.click(add);
    await waitFor(() => expect(onImported).toHaveBeenCalledOnce());
    const course = (await db.courses.get(onImported.mock.calls[0][0]))!;
    view.unmount();
    render(<CourseSpecificationSection course={course} />);
    const details = within(screen.getByRole('region', { name: 'Course identity' }));
    expect(details.getByText(board, { exact: true })).toBeVisible();
    expect(details.getByText(code, { exact: true })).toBeVisible();
    expect(details.getByText(route, { exact: true })).toBeVisible();
    expect(details.getByText(/Course tier eligibility is unverified/)).toBeVisible();
    expect(screen.queryByText(/Custom course/)).not.toBeInTheDocument();
    // Catalogue identity must not manufacture a curriculum or assign points to Cards.
    expect(course.specificationData).toBeUndefined();
    expect(course.specificationRef).toBeUndefined();
    expect(
      (await db.concepts.toArray()).every((concept) => !concept.specificationPointIds?.length),
    ).toBe(true);
  },
);

it.each([
  ['unknown-lineage', 10],
  ['tj7755-lacuna-content-2028-aqa-8464-pilot', 11],
])(
  'does not infer catalogue facts from the title or an unreviewed revision: %s/%s',
  async (lineage, revision) => {
    const source = publication(lineage, revision);
    source.course.n = 'Combined Science AQA 8464 Higher Trilogy';
    render(<SharedCourseImport initialFile={courseFile(source)} />);
    await screen.findByRole('button', { name: 'Add to my courses' });
    expect(screen.getByText(/Tier and route are unverified/)).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Awarding body specification' }),
    ).not.toBeInTheDocument();
  },
);

it('shows supplied specification choices instead of filling them from the catalogue', async () => {
  const source = publication('tj7755-lacuna-content-2028-aqa-8464-pilot', 10);
  source.course.specificationData = paperSpecification;
  source.course.specificationRef = paperSpecificationReference;
  render(<SharedCourseImport initialFile={courseFile(source)} />);
  await screen.findByRole('button', { name: 'Add to my courses' });
  const identity = within(screen.getByRole('region', { name: 'Course identity' }));
  expect(identity.getByText('EXAMPLE', { exact: true })).toBeVisible();
  expect(identity.getByText('Higher', { exact: true })).toBeVisible();
  expect(identity.getByText('Written papers', { exact: true })).toBeVisible();
  expect(identity.queryByText('8464', { exact: true })).not.toBeInTheDocument();
  expect(identity.queryByText(/Publisher tier target/)).not.toBeInTheDocument();
});

it('retains conflicting supplied labels without presenting a false catalogue route', async () => {
  const source = publication('tj7755-lacuna-content-2028-aqa-8464-pilot', 10);
  source.course.examBoard = 'OCR';
  source.course.specification = 'J247';
  render(<SharedCourseImport initialFile={courseFile(source)} />);
  await screen.findByRole('button', { name: 'Add to my courses' });
  const identity = within(screen.getByRole('region', { name: 'Course identity' }));
  expect(identity.getByText('OCR', { exact: true })).toBeVisible();
  expect(identity.getByText('J247', { exact: true })).toBeVisible();
  expect(identity.queryByText('Trilogy', { exact: true })).not.toBeInTheDocument();
  expect(identity.getByText(/Tier and route are unverified/)).toBeVisible();
});

it('previews the local identity retained by a publication update', async () => {
  const lineage = 'tj7755-lacuna-content-2028-aqa-8464-pilot';
  const imported = await importLineageFirstTime(publication(lineage, 9));
  await updateCourse(imported.course.id, { examBoard: 'OCR', specification: 'J247' });
  const onImported = vi.fn();
  const view = render(
    <SharedCourseImport
      initialFile={courseFile(publication(lineage, 10))}
      onImported={onImported}
    />,
  );
  const update = await screen.findByRole('button', { name: 'Update course' });
  const preview = within(screen.getByRole('region', { name: 'Course identity' }));
  expect(preview.getByText('OCR', { exact: true })).toBeVisible();
  expect(preview.getByText('J247', { exact: true })).toBeVisible();
  expect(preview.queryByText('Trilogy', { exact: true })).not.toBeInTheDocument();
  fireEvent.click(update);
  await waitFor(() => expect(onImported).toHaveBeenCalledOnce());
  const stored = (await db.courses.get(imported.course.id))!;
  expect(stored.distributedCopy?.revision).toBe(10);
  view.unmount();
  render(<CourseSpecificationSection course={stored} />);
  const reopened = within(screen.getByRole('region', { name: 'Course identity' }));
  expect(reopened.getByText('OCR', { exact: true })).toBeVisible();
  expect(reopened.getByText('J247', { exact: true })).toBeVisible();
  expect(reopened.queryByText('Trilogy', { exact: true })).not.toBeInTheDocument();
});
