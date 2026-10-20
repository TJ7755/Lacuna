import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ConnectClassForm, TodayPage } from './TeacherCourses';
import type { ClassSession } from './StandaloneTeacherHome';

const { store } = vi.hoisted(() => ({
  store: { list: vi.fn(), connect: vi.fn(), createFromLink: vi.fn(), close: vi.fn() },
}));
vi.mock('./connectionStore', () => ({ createGapsConnectionStore: () => store }));
const shareId = 'a'.repeat(32);
const day = '2026-10-19';
const biology = { shareId, courseName: 'GCSE Biology', verifiedAt: 0 };
const chemistry = { shareId: 'b'.repeat(32), courseName: 'GCSE Chemistry', verifiedAt: 0 };

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.clearAllMocks();
  store.list.mockResolvedValue([]);
});

it('opens the connection form on the page when there are no classes', () => {
  const page = render(
    <TodayPage
      courses={[]}
      sessions={new Map()}
      day={day}
      connectRequest={0}
      onOpen={vi.fn()}
      onConnected={vi.fn()}
    />,
  );
  expect(screen.getByRole('heading', { name: 'Connect your first class' })).toBeVisible();
  expect(screen.getByRole('form', { name: 'Create class from a course link' })).toBeVisible();
  page.rerender(
    <TodayPage
      courses={[]}
      sessions={new Map()}
      day={day}
      connectRequest={1}
      onOpen={vi.fn()}
      onConnected={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Use a connection file' }));
  expect(screen.getByLabelText('Connection file')).toHaveFocus();
});

it('expands the connection form from its button once classes exist', async () => {
  const props = {
    courses: [biology],
    sessions: new Map(),
    day,
    onOpen: vi.fn(),
    onConnected: vi.fn(),
  };
  const page = render(<TodayPage {...props} connectRequest={0} />);
  const trigger = screen.getByRole('button', { name: 'Connect a class' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('form', { name: 'Connect a class' })).not.toBeInTheDocument();
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Use a connection file' }));
  expect(screen.getByLabelText('Connection file')).toHaveFocus();
  fireEvent.keyDown(screen.getByLabelText('Connection file'), { key: 'Escape' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(trigger).toHaveFocus();
  // The sidebar's shortcut opens the same form.
  page.rerender(<TodayPage {...props} connectRequest={1} />);
  await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
});

it('makes the first locked class the default next step and summarises unlocked ones', () => {
  const onOpen = vi.fn();
  const session = {
    days: new Map([
      [
        day,
        {
          unreadable: 0,
          reports: [
            {
              slotId: 'slot',
              report: {
                v: 1,
                shareId,
                day,
                omitted: 0,
                pupil: { id: 'c'.repeat(32), label: 'Ada' },
                events: [
                  {
                    id: 'event',
                    kind: 'card',
                    at: 0,
                    itemId: 'card',
                    prompt: 'Card recall',
                    answer: '',
                    conceptIds: [],
                    earned: null,
                    available: null,
                    retained: false,
                    criteria: [],
                    marking: 'recall',
                    disputed: false,
                    shortened: false,
                  },
                ],
              },
            },
          ],
        },
      ],
    ]),
  } as unknown as ClassSession;
  render(
    <TodayPage
      courses={[biology, chemistry]}
      sessions={new Map([[shareId, session]])}
      day={day}
      connectRequest={0}
      onOpen={onOpen}
      onConnected={vi.fn()}
    />,
  );
  expect(screen.getByText('1 reports · 1 to revisit')).toBeVisible();
  const unlock = screen.getByRole('button', { name: 'Unlock GCSE Chemistry' });
  expect(unlock.className).toContain('bg-accent');
  expect(screen.getByRole('button', { name: 'Open GCSE Biology' }).className).not.toContain(
    'bg-accent ',
  );
  fireEvent.click(unlock);
  expect(onOpen).toHaveBeenCalledWith(chemistry);
});

it('reports a rejected connection without claiming success and clears its passphrase', async () => {
  store.connect.mockRejectedValue(new Error('decrypt failed'));
  const onConnected = vi.fn();
  render(<ConnectClassForm onConnected={onConnected} />);
  fireEvent.click(screen.getByRole('button', { name: 'Use a connection file' }));
  fireEvent.change(screen.getByLabelText('Connection file'), {
    target: { files: [new File(['{}'], 'course.json')] },
  });
  fireEvent.change(screen.getByLabelText('Connection passphrase'), {
    target: { value: 'my connection phrase' },
  });
  fireEvent.submit(screen.getByRole('form', { name: 'Connect a class' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/passphrase/);
  expect(screen.getByLabelText('Connection passphrase')).toHaveValue('');
  expect(onConnected).not.toHaveBeenCalled();
});

it('rejects an oversized file before touching the connection store', async () => {
  render(<ConnectClassForm onConnected={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Use a connection file' }));
  fireEvent.change(screen.getByLabelText('Connection file'), {
    target: { files: [new File(['x'.repeat(9000)], 'course.json')] },
  });
  fireEvent.change(screen.getByLabelText('Connection passphrase'), { target: { value: 'phrase' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Connect a class' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('smaller than 8 KiB');
  await waitFor(() => expect(store.connect).not.toHaveBeenCalled());
});

it('opens the independently created class in the redesigned workspace', async () => {
  const course = { shareId, courseName: 'Biology', verifiedAt: 0 };
  store.createFromLink.mockResolvedValue(shareId);
  store.list.mockResolvedValue([course]);
  const onConnected = vi.fn();
  render(<ConnectClassForm onConnected={onConnected} />);
  fireEvent.change(screen.getByLabelText('Course link or code'), { target: { value: shareId } });
  fireEvent.change(screen.getByLabelText(/^Connection passphrase/), {
    target: { value: 'several separate teacher words' },
  });
  fireEvent.change(screen.getByLabelText('Repeat connection passphrase'), {
    target: { value: 'several separate teacher words' },
  });
  fireEvent.submit(screen.getByRole('form', { name: 'Create class from a course link' }));
  await waitFor(() => expect(onConnected).toHaveBeenCalledWith(course));
});

it.each([{ courses: [] }, { courses: [biology] }])(
  'prefills and reveals class set-up without submitting (%j)',
  async ({ courses }) => {
    window.history.replaceState({ preserved: true }, '', `/gaps?source=share#course=${shareId}`);
    render(
      <TodayPage
        courses={courses}
        sessions={new Map()}
        day={day}
        connectRequest={0}
        onOpen={vi.fn()}
        onConnected={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByLabelText('Course link or code')).toBeVisible());
    expect(screen.getByLabelText('Course link or code')).toHaveValue(
      `https://getlacuna.app/#/s/${shareId}`,
    );
    await waitFor(() => expect(screen.getByLabelText(/^Connection passphrase/)).toHaveFocus());
    expect(store.createFromLink).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
    expect(window.location.pathname + window.location.search).toBe('/gaps?source=share');
    expect(window.history.state).toEqual({ preserved: true });
  },
);

it.each([
  '#course=abc',
  `#course=${'A'.repeat(32)}`,
  `#course=${shareId}&extra=1`,
  `#course=${shareId}%0A`,
  '#/teach',
  '#/share',
])('ignores other hashes: %s', (hash) => {
  // Assign through history so the browser applies its normal URL parsing.
  window.history.replaceState(null, '', `/gaps${hash}`);
  const expected = window.location.hash;
  render(
    <TodayPage
      courses={[]}
      sessions={new Map()}
      day={day}
      connectRequest={0}
      onOpen={vi.fn()}
      onConnected={vi.fn()}
    />,
  );
  expect(screen.getByLabelText('Course link or code')).toHaveValue('');
  expect(window.location.hash).toBe(expected);
  expect(store.createFromLink).not.toHaveBeenCalled();
});
