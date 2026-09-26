import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShareLinkPage } from './ShareLinkPage';

const SHARE_ID = 'a'.repeat(32);

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  decodeFile: vi.fn(),
  importShare: vi.fn(),
}));

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn().mockResolvedValue(undefined);
    clear = vi.fn().mockResolvedValue(undefined);
  },
}));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ notify: mocks.notify }) }));
vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['none'],
  speedMultiplier: () => 0,
}));
vi.mock('../db/courseFile', () => ({
  decodeCourseFile: mocks.decodeFile,
  MAX_COURSE_FILE_BYTES: 100_000_000,
  withCourseFileAssets: (_file: unknown, work: () => Promise<unknown>) => work(),
}));
vi.mock('../db/share', () => ({
  decodeShare: vi.fn(),
  summariseShare: () => ({
    kind: 'course',
    courseName: 'Shared biology',
    lessonCount: 1,
    noteCount: 0,
    cardCount: 2,
    deckNames: [],
    exportedAt: Date.now(),
  }),
  importSharePayload: mocks.importShare,
}));
vi.mock('../db/mergeImport', () => ({ isLineagePayload: () => false }));

function open(code: string) {
  render(
    <MemoryRouter initialEntries={[`/s/${code}`]}>
      <Routes>
        <Route path="/s/:code" element={<ShareLinkPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function stubFetch(response: Response) {
  vi.stubGlobal('fetch', vi.fn(async () => response));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  mocks.decodeFile.mockResolvedValue({ payload: { v: 2 }, assets: [] });
  mocks.importShare.mockResolvedValue({ courses: 1, cards: 2, courseIds: ['biology'] });
});

it('shows the unavailable state without fetching for an invalid code', async () => {
  const fetchImpl = vi.fn();
  vi.stubGlobal('fetch', fetchImpl);
  open('not-a-share-code');
  expect(await screen.findByText('This link is unavailable')).toBeInTheDocument();
  expect(screen.getByText(/invalid or has been removed/)).toBeInTheDocument();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('shows the unavailable state when the relay has no payload', async () => {
  stubFetch(
    new Response(JSON.stringify({ error: 'not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  open(SHARE_ID);
  expect(await screen.findByText('This link is unavailable')).toBeInTheDocument();
  expect(screen.getByText(/invalid or has been removed/)).toBeInTheDocument();
});

it('retries a failed fetch from the unavailable state', async () => {
  const fetchImpl = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchImpl);
  open(SHARE_ID);
  expect(await screen.findByText('This link is unavailable')).toBeInTheDocument();

  const bytes = new TextEncoder().encode('{"format":"lacuna-course"}');
  fetchImpl.mockResolvedValue(
    new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream', ETag: '"t1"' },
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Shared biology')).toBeInTheDocument();
});

it('fetches the payload and imports it as a course file, recording the link', async () => {
  const bytes = new TextEncoder().encode('{"format":"lacuna-course"}');
  stubFetch(
    new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream', ETag: '"t1"' },
    }),
  );
  open(SHARE_ID);
  expect(await screen.findByText('Shared biology')).toBeInTheDocument();
  expect(mocks.importShare).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Add to my courses' }));
  await waitFor(() => expect(mocks.importShare).toHaveBeenCalledWith({ v: 2 }));
  expect(JSON.parse(localStorage.getItem('lacuna.shareImports') ?? '{}')).toEqual({
    [SHARE_ID]: 'biology',
  });
});
