import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OcclusionEditor } from './OcclusionEditor';
import type { Course, Occlusion } from '../db/types';

let mockCourse: Course | null | undefined;
let mockLesson: null | undefined;
let mockOcclusion: Occlusion | null | undefined;
const mockNotify = vi.fn();
const createOcclusion = vi.fn().mockResolvedValue(undefined);
const updateOcclusion = vi.fn().mockResolvedValue(undefined);
const deleteOcclusion = vi.fn().mockResolvedValue(undefined);
const snapshotOcclusion = vi.fn().mockResolvedValue({ occlusion: 'snapshot' });
const restoreOcclusion = vi.fn().mockResolvedValue(undefined);
const storeOcclusionDiagram = vi.fn();
const resolveAssetUrl = vi.fn().mockResolvedValue('blob:diagram');

vi.mock('../state/useCourseData', () => ({
  useCourse: () => mockCourse,
  useLesson: () => mockLesson,
  useOcclusion: () => mockOcclusion,
}));

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ notify: mockNotify }),
}));

vi.mock('../db/occlusionRepository', () => ({
  createOcclusion: (...args: unknown[]) => createOcclusion(...args),
  updateOcclusion: (...args: unknown[]) => updateOcclusion(...args),
  deleteOcclusion: (...args: unknown[]) => deleteOcclusion(...args),
  snapshotOcclusion: (...args: unknown[]) => snapshotOcclusion(...args),
  restoreOcclusion: (...args: unknown[]) => restoreOcclusion(...args),
}));

vi.mock('../db/occlusionImage', () => ({
  storeOcclusionDiagram: (...args: unknown[]) => storeOcclusionDiagram(...args),
}));

vi.mock('../db/assetCache', () => ({
  resolveAssetUrl: (...args: unknown[]) => resolveAssetUrl(...args),
}));

const course: Course = {
  id: 'course-1',
  name: 'Biology',
  description: '',
  createdAt: Date.now(),
  updatedAt: 1,
  examDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
  timeZone: 'UTC',
  fsrsVersion: 6,
  fsrsParameters: {
    requestRetention: 0.9,
    w: Array(21).fill(0),
    enable_fuzz: true,
    maximum_interval: 36500,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
  },
  examObjective: 'expectedMarks',
  unlockMode: 'linear',
  autoPractice: false,
  practiceThresholdMinutesFar: 12,
  practiceThresholdMinutesNear: 6,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 3,
};

function renderNew(lessonMode = false) {
  return render(
    <MemoryRouter
      initialEntries={[
        lessonMode
          ? '/course/course-1/lesson/lesson-1/occlusion/new'
          : '/course/course-1/occlusion/new',
      ]}
    >
      <Routes>
        <Route path="/course/:courseId/occlusion/new" element={<OcclusionEditor />} />
        <Route
          path="/course/:courseId/lesson/:lessonId/occlusion/new"
          element={<OcclusionEditor />}
        />
        <Route path="/course/:courseId/cards" element={<p>Cards</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderEdit() {
  return render(
    <MemoryRouter initialEntries={['/course/course-1/occlusion/occ-1/edit']}>
      <Routes>
        <Route path="/course/:courseId/occlusion/:occlusionId/edit" element={<OcclusionEditor />} />
        <Route path="/course/:courseId/cards" element={<p>Cards</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Stub the container's bounding box so drag maths are deterministic, then drag a
 *  rectangle across the diagram. */
function drawBox(container: HTMLElement, from: [number, number], to: [number, number]) {
  const canvas = container.querySelector('[data-testid="occlusion-canvas"]') as HTMLElement;
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 400,
    height: 300,
    right: 400,
    bottom: 300,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: from[0], clientY: from[1] });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: to[0], clientY: to[1] });
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: to[0], clientY: to[1] });
}

async function uploadDiagram() {
  storeOcclusionDiagram.mockResolvedValue({
    hash: 'hash-1',
    kind: 'image',
    mimeType: 'image/png',
    createdAt: 0,
  });
  const input = screen.getByLabelText('Upload diagram', { exact: false });
  const file = new File(['x'], 'diagram.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByRole('img');
}

beforeEach(() => {
  mockCourse = undefined;
  mockLesson = undefined;
  mockOcclusion = undefined;
  mockNotify.mockClear();
  createOcclusion.mockClear();
  updateOcclusion.mockClear();
  deleteOcclusion.mockClear();
  snapshotOcclusion.mockClear();
  restoreOcclusion.mockClear();
  storeOcclusionDiagram.mockReset();
  resolveAssetUrl.mockClear();
  resolveAssetUrl.mockResolvedValue('blob:diagram');
});

describe('OcclusionEditor', () => {
  it.each(['course', 'lesson', 'occlusion'] as const)(
    'keeps the missing-%s state aligned and its Back target full-size',
    (missing) => {
      mockCourse = missing === 'course' ? null : course;
      mockLesson = missing === 'lesson' ? null : undefined;
      mockOcclusion = missing === 'occlusion' ? null : undefined;
      const { container } =
        missing === 'occlusion' ? renderEdit() : renderNew(missing === 'lesson');
      expect(screen.getByText(`This ${missing} could not be found.`)).toBeInTheDocument();
      expect(container.firstElementChild).toHaveClass('max-w-[1190px]', 'w-full');
      const back = screen.getByRole('link');
      expect(back).toHaveClass('min-h-11');
      expect(back).toHaveAttribute(
        'href',
        missing === 'course'
          ? '/'
          : missing === 'lesson'
            ? '/course/course-1'
            : '/course/course-1/cards',
      );
    },
  );
  it('aligns with course pages and offers one full-size destination-aware Back link', () => {
    mockCourse = course;
    const { container } = renderNew();
    expect(container.firstElementChild).toHaveClass('max-w-[1190px]', 'w-full');
    const back = screen.getByRole('link', { name: 'Back to Cards' });
    expect(back).toHaveAttribute('href', '/course/course-1/cards');
    expect(back).toHaveClass('min-h-11');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
  it('gives the occlusion name a visible label and keeps Tab in document order', () => {
    mockCourse = course;
    renderNew();
    const name = screen.getByRole('textbox', { name: 'Name' });
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    fireEvent(name, event);
    expect(event.defaultPrevented).toBe(false);
  });
  it('opens directly on the task without a decorative subtitle', () => {
    mockCourse = course;
    renderNew();
    expect(screen.queryByText(/Mask parts of a diagram to test recall/)).not.toBeInTheDocument();
  });
  it('shows a skeleton while loading', () => {
    renderNew();
    expect(screen.queryByText('New occlusion')).not.toBeInTheDocument();
  });

  it('renders the upload prompt before any diagram is set', () => {
    mockCourse = course;
    renderNew();
    expect(screen.getByRole('heading', { name: 'New occlusion' })).toBeInTheDocument();
    expect(screen.getByText('Upload a diagram to begin.')).toBeInTheDocument();
  });

  it('converts a drawn box to fractions of the image on capture, clamped to bounds', async () => {
    mockCourse = course;
    const { container } = renderNew();
    await uploadDiagram();

    drawBox(container, [40, 30], [200, 180]);

    // 40/400=0.1, 30/300=0.1; 200/400=0.5, 180/300=0.6 -> x0.1 y0.1 w0.4 h0.5.
    expect(screen.getByText('Box 1')).toBeInTheDocument();
    expect(screen.getByText('1 card will be generated')).toBeInTheDocument();
  });

  it('ignores a degenerate near-zero drag', async () => {
    mockCourse = course;
    const { container } = renderNew();
    await uploadDiagram();

    drawBox(container, [40, 30], [41, 31]);

    expect(screen.queryByText('Box 1')).not.toBeInTheDocument();
  });

  it('shows a live generated-card count that updates as regions are drawn', async () => {
    mockCourse = course;
    const { container } = renderNew();
    await uploadDiagram();

    expect(screen.getByText('0 cards will be generated')).toBeInTheDocument();

    drawBox(container, [40, 30], [200, 180]);
    expect(screen.getByText('1 card will be generated')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Draw feature' }));
    drawBox(container, [250, 30], [350, 130]);
    expect(screen.getByText('2 cards will be generated')).toBeInTheDocument();
    expect(
      screen.getByText('1 label, 1 feature — read-only in the card editor'),
    ).toBeInTheDocument();
  });

  it('draws a label and a feature region, pairs them, and saves the expected shape', async () => {
    mockCourse = course;
    const { container } = renderNew();
    await uploadDiagram();

    drawBox(container, [40, 30], [200, 180]);
    fireEvent.click(screen.getByRole('button', { name: 'Draw feature' }));
    drawBox(container, [250, 30], [350, 130]);

    // The feature region drawn second is selected; pair it to the label.
    const pairSelect = screen.getByLabelText('Paired label');
    const labelOption = within(pairSelect).getByRole('option', {
      name: 'Box 1',
    }) as HTMLOptionElement;
    fireEvent.change(pairSelect, { target: { value: labelOption.value } });

    fireEvent.change(screen.getByPlaceholderText('e.g. The plant cell'), {
      target: { value: 'Plant cell' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add occlusion' }));
      await vi.waitFor(() => expect(createOcclusion).toHaveBeenCalled());
      await Promise.resolve(createOcclusion.mock.results[0]?.value);
    });
    await screen.findByText('Cards');
    const [calledCourseId, calledLessonId, calledName, calledAssetHash, calledRegions] =
      createOcclusion.mock.calls[0];
    expect(calledCourseId).toBe('course-1');
    expect(calledLessonId).toBeNull();
    expect(calledName).toBe('Plant cell');
    expect(calledAssetHash).toBe('hash-1');
    expect(calledRegions).toHaveLength(2);
    expect(calledRegions[0]).toMatchObject({
      role: 'label',
      shape: 'rectangle',
      x: 0.1,
      y: 0.1,
      w: 0.4,
      h: 0.5,
    });
    expect(calledRegions[1]).toMatchObject({
      role: 'feature',
      pairedRegionId: calledRegions[0].id,
    });
  });

  it('keeps the editor controls in Tab order once complete and saves with Ctrl+Enter', async () => {
    mockCourse = course;
    const { container } = renderNew();
    const name = screen.getByPlaceholderText('e.g. The plant cell');
    expect(name).toHaveFocus();
    await uploadDiagram();
    drawBox(container, [40, 30], [200, 180]);
    fireEvent.change(name, { target: { value: 'Plant cell' } });
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    fireEvent(name, tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(name).toHaveFocus();
    await act(async () => {
      fireEvent.keyDown(name, { key: 'Enter', ctrlKey: true });
      await vi.waitFor(() => expect(createOcclusion).toHaveBeenCalled());
    });
  });

  it('cancels a pristine new occlusion on Escape', async () => {
    mockCourse = course;
    renderNew();
    fireEvent.keyDown(screen.getByPlaceholderText('e.g. The plant cell'), { key: 'Escape' });
    await screen.findByText('Cards');
  });

  it('warns before replacing the diagram of an existing occlusion, and only regenerates on confirm', async () => {
    mockCourse = course;
    mockOcclusion = {
      id: 'occ-1',
      courseId: 'course-1',
      primaryLessonId: null,
      name: 'Plant cell',
      assetHash: 'hash-old',
      regions: [{ id: 'r1', role: 'label', shape: 'rectangle', x: 0.1, y: 0.1, w: 0.2, h: 0.2 }],
      createdAt: 0,
      updatedAt: 0,
    };
    renderEdit();
    await screen.findByRole('img');

    storeOcclusionDiagram.mockResolvedValue({
      hash: 'hash-new',
      kind: 'image',
      mimeType: 'image/png',
      createdAt: 0,
    });
    const input = screen.getByLabelText('Replace diagram', { exact: false });
    const file = new File(['x'], 'new.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('Regenerate every card in this occlusion?')).toBeInTheDocument();
    expect(storeOcclusionDiagram).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
      await Promise.resolve(storeOcclusionDiagram.mock.results[0]?.value);
    });
    await vi.waitFor(() => expect(storeOcclusionDiagram).toHaveBeenCalledWith(file));
    await vi.waitFor(() => expect(resolveAssetUrl).toHaveBeenCalledWith('hash-new'));
    const hashNewCall = resolveAssetUrl.mock.calls.findIndex(([hash]) => hash === 'hash-new');
    await act(async () => {
      await Promise.resolve(resolveAssetUrl.mock.results[hashNewCall]?.value);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await vi.waitFor(() => expect(updateOcclusion).toHaveBeenCalled());
      await Promise.resolve(updateOcclusion.mock.results[0]?.value);
    });
    await screen.findByText('Cards');
    expect(updateOcclusion.mock.calls[0][0]).toMatchObject({ assetHash: 'hash-new' });
  });

  it('confirms, snapshots, and deletes the occlusion with an undo toast', async () => {
    mockCourse = course;
    mockOcclusion = {
      id: 'occ-1',
      courseId: 'course-1',
      primaryLessonId: null,
      name: 'Plant cell',
      assetHash: 'hash-old',
      regions: [{ id: 'r1', role: 'label', shape: 'rectangle', x: 0.1, y: 0.1, w: 0.2, h: 0.2 }],
      createdAt: 0,
      updatedAt: 0,
    };
    renderEdit();
    await screen.findByRole('img');

    fireEvent.click(screen.getByText('Delete occlusion'));
    expect(snapshotOcclusion).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByText('Delete occlusion'));
      await vi.waitFor(() => expect(snapshotOcclusion).toHaveBeenCalledWith('occ-1'));
      await Promise.resolve(snapshotOcclusion.mock.results[0]?.value);
      await vi.waitFor(() => expect(deleteOcclusion).toHaveBeenCalledWith('occ-1'));
      await Promise.resolve(deleteOcclusion.mock.results[0]?.value);
    });
    await screen.findByText('Cards');
    expect(mockNotify).toHaveBeenCalledWith(
      expect.stringContaining('deleted'),
      'neutral',
      expect.objectContaining({ actionLabel: 'Undo' }),
    );

    const [, , options] = mockNotify.mock.calls[mockNotify.mock.calls.length - 1];
    options.onAction();
    await vi.waitFor(() =>
      expect(restoreOcclusion).toHaveBeenCalledWith({ occlusion: 'snapshot' }),
    );
  });

  it('stacks the canvas and region pane in a single column below 760px, never overflowing', async () => {
    mockCourse = course;
    const { container } = renderNew();
    await uploadDiagram();

    const split = container.querySelector('.grid.grid-cols-1');
    expect(split).not.toBeNull();
    expect(split?.className).toContain('min-[760px]:grid-cols-[minmax(0,1fr)_260px]');
    expect(container.querySelector('.overflow-x-auto')).toBeNull();
  });
});
