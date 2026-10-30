import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { domAnimation, LazyMotion } from 'motion/react';
import { CourseLibraryImport } from './CourseLibraryImport';
import { ShareLinkImport } from './ShareLinkImport';
import { db } from '../../db/schema';
import type { SharePayloadV2 } from '../../db/share';
import { getShareIdForCourse } from '../../shareLinks/linkStore';
import { finishOnboarding } from '../../onboarding/onboardingState';

vi.mock('../ui/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['none'],
  speedMultiplier: () => 0,
}));

const shareId = 'f59cf55a906edfede13902ca7bfda358';
const coverage =
  'Selected Pearson Edexcel Biology topics and original practice. Some board requirements remain outside this selection.';
const source: SharePayloadV2 = {
  v: 2,
  at: 1000,
  li: 'coverage-biology',
  rv: 7,
  course: { n: 'Biology Pearson Edexcel 1BI0', o: 0, c: 1000, sm: 1, um: 'open' },
  lessons: [{ i: 'cells', n: 'Cells', notes: [], cards: [] }],
};
function courseFile(payload = source) {
  return JSON.stringify({ format: 'lacuna-course', version: 1, payload, assets: [] });
}

beforeEach(async () => {
  localStorage.clear();
  finishOnboarding();
  await db.delete();
  await db.open();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          url.endsWith('/meta')
            ? JSON.stringify({
                v: 1,
                lineageId: source.li,
                revision: 7,
                publishedAt: 1000,
                byteSize: courseFile().length,
                courseName: source.course.n,
              })
            : courseFile(),
          { headers: { ETag: '"7"' } },
        ),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

it.each(['library', 'share link'])(
  'shows the known coverage before confirming through the %s route',
  async (route) => {
    const opened = vi.fn();
    if (route === 'library') {
      render(
        <LazyMotion features={domAnimation}>
          <CourseLibraryImport
            backLabel="New course"
            onBack={vi.fn()}
            browse={{ query: '1BI0', subject: null }}
            onBrowseChange={vi.fn()}
            onOpenCourse={opened}
          />
        </LazyMotion>,
      );
      fireEvent.click(screen.getByRole('button', { name: /Biology Pearson Edexcel GCSE/ }));
    } else {
      render(<ShareLinkImport code={shareId} isCurrent={() => true} onOpenCourse={opened} />);
    }
    const add = await screen.findByRole('button', { name: 'Add to my courses' });
    const context = screen.getByRole('region', { name: 'Course coverage' });
    await waitFor(() => expect(within(context).getByText(coverage)).toBeVisible());
    expect(
      within(context).getByRole('link', { name: 'View public course details' }),
    ).toHaveAttribute('href', 'https://getlacuna.app/courses/biology1bi0/');
    expect(context.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await db.courses.count()).toBe(0);
    fireEvent.click(screen.getByRole('radio', { name: /Steady retention/ }));
    fireEvent.click(add);
    await waitFor(() => expect(opened).toHaveBeenCalledOnce());
    expect(getShareIdForCourse(opened.mock.calls[0][0])).toBe(shareId);
  },
);

it('does not infer catalogue coverage from a course name on an unrelated share link', async () => {
  render(<ShareLinkImport code={'a'.repeat(32)} isCurrent={() => true} onOpenCourse={vi.fn()} />);
  await screen.findByRole('button', { name: 'Add to my courses' });
  expect(screen.queryByRole('region', { name: 'Course coverage' })).not.toBeInTheDocument();
});

it('clears the catalogue coverage when a different file replaces the linked preview', async () => {
  render(<ShareLinkImport code={shareId} isCurrent={() => true} onOpenCourse={vi.fn()} />);
  await screen.findByRole('button', { name: 'Add to my courses' });
  expect(screen.getByText(coverage)).toBeVisible();
  fireEvent.change(screen.getByLabelText('Course file to import'), {
    target: {
      files: [
        new File(
          [
            courseFile({
              ...source,
              li: 'other-course',
              course: { ...source.course, n: 'French' },
            }),
          ],
          'French.lacuna',
        ),
      ],
    },
  });
  expect(await screen.findByText('French')).toBeVisible();
  expect(screen.queryByRole('region', { name: 'Course coverage' })).not.toBeInTheDocument();
});
