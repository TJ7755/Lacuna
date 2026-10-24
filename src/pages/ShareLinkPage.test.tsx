import 'fake-indexeddb/auto';
import { useEffect, useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AnimatePresence, motion } from 'motion/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppLink } from '../components/ui/AppLink';
import { db } from '../db/schema';
import type { Course } from '../db/types';
import { getCourseIdForShare } from '../shareLinks/linkStore';
import * as linkStore from '../shareLinks/linkStore';
import { ShareLinkPage } from './ShareLinkPage';
import { formatClassCode } from '../insights/classCode';
import { encodeSharePayload } from '../shareLinks/payloadCodec';
import { createEnrolmentSetting } from '../insights/enrolment';

const SHARE_ID = 'a'.repeat(32);
const LINEAGE_ID = 'lineage-teacher';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  decodeFile: vi.fn(),
  importShare: vi.fn(),
  findCourse: vi.fn(),
  recipient: vi.fn(),
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
vi.mock('../db/mergeImport', () => ({
  isLineagePayload: () => false,
  findCourseForLineage: mocks.findCourse,
}));
vi.mock('../insights/classKey', () => ({
  getClassRecipient: mocks.recipient,
  getPublishedClassRecipient: mocks.recipient,
}));

function JoinEntryProbe() {
  return <p>Class code entry: {useLocation().search}</p>;
}
function ImportedCourseProbe() {
  const location = useLocation();
  return (
    <div data-route-content={location.pathname}>
      <h1>Imported biology course</h1>
    </div>
  );
}
function DelayedCourseProbe({ ready }: { ready: Promise<void> }) {
  const [loaded, setLoaded] = useState(false);
  const location = useLocation();
  useEffect(() => {
    void ready.then(() => setLoaded(true));
  }, [ready]);
  return (
    <div data-route-content={location.pathname}>
      <button>Course action</button>
      {loaded && <h1>Imported biology course</h1>}
    </div>
  );
}
function open(code: string, coursePage: ReactNode = <ImportedCourseProbe />) {
  render(
    <MemoryRouter initialEntries={[`/s/${code}`]}>
      <Routes>
        <Route
          path="/s/:code"
          element={
            <>
              <AppLink to="/">Leave share page</AppLink>
              <ShareLinkPage />
            </>
          }
        />
        <Route path="/" element={<JoinEntryProbe />} />
        <Route path="/course/:courseId" element={coursePage} />
      </Routes>
    </MemoryRouter>,
  );
}

function manifestResponse(lineageId: string) {
  return new Response(
    JSON.stringify({
      v: 1,
      lineageId,
      revision: 1,
      publishedAt: 1000,
      byteSize: 10,
      courseName: 'Shared biology',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ETag: '"m1"' } },
  );
}

function notFoundResponse() {
  return new Response(JSON.stringify({ error: 'not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Serve the payload bytes and, unless told otherwise, a matching manifest. */
function stubFetch(payloadResponse: Response, metaResponse?: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const href =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (href.includes('/meta')) return metaResponse ?? manifestResponse(LINEAGE_ID);
      return payloadResponse;
    }),
  );
}

function seedTrackedCourse(id: string, lineageId: string) {
  return db.courses.put({
    id,
    distributedCopy: { lineageId, revision: 1, locked: true, autoAcceptUpdates: false },
  } as Course);
}

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  await db.delete();
  await db.open();
  mocks.decodeFile.mockResolvedValue({ payload: { v: 2 }, assets: [] });
  mocks.importShare.mockResolvedValue({ courses: 1, cards: 2, courseIds: ['biology'] });
  mocks.findCourse.mockResolvedValue(null);
  mocks.recipient.mockReset();
});

it('joins an existing imported course using a pinned class code, keeping consent off', async () => {
  const recipient = { keyId: 'b'.repeat(64), publicKey: 'public' };
  await seedTrackedCourse('biology', LINEAGE_ID);
  mocks.findCourse.mockResolvedValue({ id: 'biology' });
  mocks.recipient.mockResolvedValue(recipient);
  stubFetch(new Response('{}', { status: 200, headers: { ETag: '"1"' } }));
  open(formatClassCode({ shareId: SHARE_ID, keyId: recipient.keyId }));
  const toggle = await screen.findByRole('switch', { name: 'Share insights with your teacher' });
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(createEnrolmentSetting('biology').read()).toMatchObject({
    shareId: SHARE_ID,
    recipient,
    consentedAt: null,
  });
  expect(mocks.recipient).toHaveBeenCalledWith(
    expect.objectContaining({ shareId: SHARE_ID, keyId: recipient.keyId }),
  );
  expect(mocks.importShare).not.toHaveBeenCalled();
});

it('blocks a class invitation when its teacher key cannot be verified', async () => {
  mocks.recipient.mockRejectedValue(new Error('Teacher key does not match.'));
  stubFetch(new Response('{}', { status: 200, headers: { ETag: '"1"' } }));
  open(formatClassCode({ shareId: SHARE_ID, keyId: 'b'.repeat(64) }));
  expect(await screen.findByText('This link is unavailable')).toBeInTheDocument();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(mocks.importShare).not.toHaveBeenCalled();
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
  stubFetch(notFoundResponse());
  open(SHARE_ID);
  expect(await screen.findByText('This link is unavailable')).toBeInTheDocument();
  expect(screen.getByText(/invalid or has been removed/)).toBeInTheDocument();
});

it('retries a failed fetch from the unavailable state', async () => {
  const fetchImpl = vi.fn(async (_input: string | URL | Request) => notFoundResponse());
  vi.stubGlobal('fetch', fetchImpl);
  open(SHARE_ID);
  expect(await screen.findByText('This link is unavailable')).toBeInTheDocument();

  const bytes = new TextEncoder().encode('{"format":"lacuna-course"}');
  fetchImpl.mockImplementation(async (input: string | URL | Request) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (href.includes('/meta')) return manifestResponse(LINEAGE_ID);
    return new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream', ETag: '"t1"' },
    });
  });
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Shared biology')).toBeInTheDocument();
});

it('opens and focuses the imported course after recording its share link', async () => {
  const bytes = new TextEncoder().encode('{"format":"lacuna-course"}');
  stubFetch(
    new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream', ETag: '"t1"' },
    }),
  );
  await seedTrackedCourse('biology', LINEAGE_ID);
  open(SHARE_ID);
  expect(await screen.findByText('Shared biology')).toBeInTheDocument();
  expect(mocks.importShare).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Add to my courses' }));
  await waitFor(() => expect(mocks.importShare).toHaveBeenCalledWith({ v: 2 }, undefined));
  expect(JSON.parse(localStorage.getItem('lacuna.shareImports') ?? '{}')).toEqual({
    [SHARE_ID]: 'biology',
  });
  expect(await screen.findByRole('heading', { name: 'Imported biology course' })).toHaveFocus();
});

it.each([false, true])(
  'waits for the course heading, preserving chosen focus: %s',
  async (chooseFocus) => {
    let showHeading!: () => void;
    const ready = new Promise<void>((resolve) => {
      showHeading = resolve;
    });
    await seedTrackedCourse('biology', LINEAGE_ID);
    stubFetch(new Response('{}', { headers: { ETag: '"1"' } }));
    open(SHARE_ID, <DelayedCourseProbe ready={ready} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add to my courses' }));
    const action = await screen.findByRole('button', { name: 'Course action' });
    if (chooseFocus) action.focus();
    await act(async () => showHeading());
    const heading = screen.getByRole('heading', { name: 'Imported biology course' });
    expect(chooseFocus ? action : heading).toHaveFocus();
  },
);

it('waits for successful confirmation before opening the imported course', async () => {
  let confirm!: (matched: boolean) => void;
  vi.spyOn(linkStore, 'confirmShareImport').mockReturnValueOnce(
    new Promise<boolean>((resolve) => {
      confirm = resolve;
    }),
  );
  stubFetch(new Response('{}', { headers: { ETag: '"1"' } }));
  open(SHARE_ID);
  fireEvent.click(await screen.findByRole('button', { name: 'Add to my courses' }));
  await waitFor(() => expect(linkStore.confirmShareImport).toHaveBeenCalled());
  expect(screen.getByRole('heading', { name: 'Shared course' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Imported biology course' })).toBeNull();
  await act(async () => confirm(true));
  expect(await screen.findByRole('heading', { name: 'Imported biology course' })).toHaveFocus();
});

it('keeps the chosen destination when import finishes after leaving the share page', async () => {
  let finishImport!: (result: { courses: number; cards: number; courseIds: string[] }) => void;
  mocks.importShare.mockReturnValueOnce(
    new Promise((resolve) => {
      finishImport = resolve;
    }),
  );
  const confirmation = vi.spyOn(linkStore, 'confirmShareImport');
  await seedTrackedCourse('biology', LINEAGE_ID);
  stubFetch(new Response('{}', { headers: { ETag: '"1"' } }));
  open(SHARE_ID);
  fireEvent.click(await screen.findByRole('button', { name: 'Add to my courses' }));
  await waitFor(() => expect(mocks.importShare).toHaveBeenCalled());
  expect(confirmation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('link', { name: 'Leave share page' }));
  const destination = screen.getByText('Class code entry:');
  destination.tabIndex = -1;
  destination.focus();
  await act(async () => finishImport({ courses: 1, cards: 2, courseIds: ['biology'] }));
  expect(destination).toBeVisible();
  expect(destination).toHaveFocus();
  expect(screen.queryByRole('heading', { name: 'Imported biology course' })).toBeNull();
  expect(confirmation).not.toHaveBeenCalled();
});

it('ignores an import callback while its originating route is still exiting', async () => {
  let finishImport!: (result: { courses: number; cards: number; courseIds: string[] }) => void;
  mocks.importShare.mockReturnValueOnce(
    new Promise((resolve) => {
      finishImport = resolve;
    }),
  );
  const confirmation = vi.spyOn(linkStore, 'confirmShareImport');
  await seedTrackedCourse('biology', LINEAGE_ID);
  stubFetch(new Response('{}', { headers: { ETag: '"1"' } }));
  function ExitingRoute({ show }: { show: boolean }) {
    return (
      <MemoryRouter initialEntries={[`/s/${SHARE_ID}`]}>
        <Routes>
          <Route
            path="/s/:code"
            element={
              <>
                <p tabIndex={-1}>Chosen destination</p>
                <AnimatePresence initial={false}>
                  {show && (
                    <motion.div key="share" exit={{ opacity: 0 }} transition={{ duration: 10 }}>
                      <ShareLinkPage />
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            }
          />
          <Route path="/course/:courseId" element={<ImportedCourseProbe />} />
        </Routes>
      </MemoryRouter>
    );
  }
  const view = render(<ExitingRoute show />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add to my courses' }));
  await waitFor(() => expect(mocks.importShare).toHaveBeenCalled());
  view.rerender(<ExitingRoute show={false} />);
  expect(screen.getByRole('heading', { name: 'Shared course' })).toBeInTheDocument();
  const destination = screen.getByText('Chosen destination');
  destination.focus();
  await act(async () => finishImport({ courses: 1, cards: 2, courseIds: ['biology'] }));
  expect(destination).toBeVisible();
  expect(destination).toHaveFocus();
  expect(confirmation).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: 'Imported biology course' })).toBeNull();
});

it('keeps the chosen destination when confirmation finishes after leaving the share page', async () => {
  let confirm!: (matched: boolean) => void;
  vi.spyOn(linkStore, 'confirmShareImport').mockReturnValueOnce(
    new Promise<boolean>((resolve) => {
      confirm = resolve;
    }),
  );
  stubFetch(new Response('{}', { headers: { ETag: '"1"' } }));
  open(SHARE_ID);
  fireEvent.click(await screen.findByRole('button', { name: 'Add to my courses' }));
  await waitFor(() => expect(linkStore.confirmShareImport).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('link', { name: 'Leave share page' }));
  expect(screen.getByText('Class code entry:')).toBeVisible();
  await act(async () => confirm(true));
  await waitFor(() => expect(screen.getByText('Class code entry:')).toBeVisible());
  expect(screen.queryByRole('heading', { name: 'Imported biology course' })).toBeNull();
});

it.each(['confirmation', 'import'])(
  'keeps a failed %s visible on the share page',
  async (failure) => {
    if (failure === 'confirmation')
      vi.spyOn(linkStore, 'confirmShareImport').mockRejectedValueOnce(
        new Error('Confirmation failed.'),
      );
    else mocks.importShare.mockRejectedValueOnce(new Error('Import failed.'));
    stubFetch(new Response('{}', { headers: { ETag: '"1"' } }));
    open(SHARE_ID);
    fireEvent.click(await screen.findByRole('button', { name: 'Add to my courses' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      failure === 'confirmation' ? 'Confirmation failed.' : 'Import failed.',
    );
    expect(screen.getByRole('heading', { name: 'Shared course' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Imported biology course' })).toBeNull();
  },
);

it('keeps a newly imported class on the share page with consent off', async () => {
  const recipient = { keyId: 'b'.repeat(64), publicKey: 'public' };
  await seedTrackedCourse('biology', LINEAGE_ID);
  mocks.recipient.mockResolvedValue(recipient);
  stubFetch(new Response('{}', { headers: { ETag: '"1"' } }));
  open(formatClassCode({ shareId: SHARE_ID, keyId: recipient.keyId }));
  fireEvent.click(await screen.findByRole('button', { name: 'Add to my courses' }));
  expect(
    await screen.findByRole('switch', { name: 'Share insights with your teacher' }),
  ).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByRole('heading', { name: 'Shared course' })).toBeVisible();
  expect(createEnrolmentSetting('biology').read()).toMatchObject({
    shareId: SHARE_ID,
    recipient,
    consentedAt: null,
  });
  expect(getCourseIdForShare(SHARE_ID)).toBe('biology');
  expect(screen.queryByRole('heading', { name: 'Imported biology course' })).toBeNull();
});

it('leaves the link untracked when the imported course came from elsewhere', async () => {
  const bytes = new TextEncoder().encode('{"format":"lacuna-course"}');
  stubFetch(
    new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream', ETag: '"t1"' },
    }),
    manifestResponse('lineage-other-course'),
  );
  await seedTrackedCourse('biology', LINEAGE_ID);
  open(SHARE_ID);
  expect(await screen.findByText('Shared biology')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add to my courses' }));
  await waitFor(() => expect(mocks.importShare).toHaveBeenCalled());
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This imported course does not match the class invitation.',
  );
  expect(getCourseIdForShare(SHARE_ID)).toBeNull();
  expect(screen.getByRole('heading', { name: 'Shared course' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Imported biology course' })).toBeNull();
});

it('blocks the import when the manifest is missing so the course stays trackable', async () => {
  const bytes = new TextEncoder().encode('{"format":"lacuna-course"}');
  stubFetch(
    new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream', ETag: '"t1"' },
    }),
    notFoundResponse(),
  );
  await seedTrackedCourse('biology', LINEAGE_ID);
  open(SHARE_ID);
  expect(await screen.findByText('This link is incomplete')).toBeInTheDocument();
  expect(screen.getByText(/update details are missing/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add to my courses' })).not.toBeInTheDocument();
  expect(mocks.importShare).not.toHaveBeenCalled();
  expect(getCourseIdForShare(SHARE_ID)).toBeNull();
});

it('recovers tracking after the manifest returns', async () => {
  const bytes = new TextEncoder().encode('{"format":"lacuna-course"}');
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (href.includes('/meta')) return notFoundResponse();
    return new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream', ETag: '"t1"' },
    });
  });
  vi.stubGlobal('fetch', fetchImpl);
  await seedTrackedCourse('biology', LINEAGE_ID);
  open(SHARE_ID);
  expect(await screen.findByText('This link is incomplete')).toBeInTheDocument();

  fetchImpl.mockImplementation(async (input: string | URL | Request) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (href.includes('/meta')) return manifestResponse(LINEAGE_ID);
    return new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream', ETag: '"t1"' },
    });
  });
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Shared biology')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add to my courses' }));
  await waitFor(() => expect(mocks.importShare).toHaveBeenCalledWith({ v: 2 }, undefined));
  expect(JSON.parse(localStorage.getItem('lacuna.shareImports') ?? '{}')).toEqual({
    [SHARE_ID]: 'biology',
  });
});

it('accepts a typed short code and reaches consent using the relay teacher key', async () => {
  const recipient = { keyId: 'c'.repeat(64), publicKey: 'public' };
  await seedTrackedCourse('biology', LINEAGE_ID);
  mocks.findCourse.mockResolvedValue({ id: 'biology' });
  mocks.recipient.mockResolvedValue(recipient);
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/class-codes/K7QM4XTP')) return Response.json({ shareId: SHARE_ID });
    if (url.endsWith('/meta')) return manifestResponse(LINEAGE_ID);
    return new Response('{}', { headers: { ETag: '"1"' } });
  });
  vi.stubGlobal('fetch', fetchImpl);
  open('k7qm-4xtp');
  expect(
    await screen.findByRole('switch', { name: 'Share insights with your teacher' }),
  ).toHaveAttribute('aria-checked', 'false');
  expect(createEnrolmentSetting('biology').read()).toMatchObject({
    shareId: SHARE_ID,
    recipient,
    consentedAt: null,
  });
  expect(mocks.recipient).toHaveBeenCalledWith(expect.objectContaining({ shareId: SHARE_ID }));
});

it.each([
  [404, 'No class uses that code. Check it with your teacher.'],
  [429, 'Too many attempts. Wait a few minutes and try again.'],
])('reports short-code lookup HTTP %s without offering consent', async (status, message) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status })),
  );
  open('K7QM4XTP');
  expect(await screen.findByText(message)).toBeVisible();
  fireEvent.click(screen.getByRole('link', { name: 'Enter another class code' }));
  expect(screen.getByText('Class code entry: ?import=1&join=1')).toBeVisible();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
});

it('shows an update instruction for an unsupported compressed share without importing', async () => {
  stubFetch(new Response('LACUNA-SHARE:\u0002future', { headers: { ETag: '"1"' } }));
  open(SHARE_ID);
  expect(await screen.findByText('Update Lacuna to read this compressed share link.')).toBeInTheDocument();
  expect(mocks.decodeFile).not.toHaveBeenCalled();
  expect(mocks.importShare).not.toHaveBeenCalled();
});

it('decompresses the shared course before passing it to course-file inspection', async () => {
  const original = `${JSON.stringify({ format: 'lacuna-course' })}${' '.repeat(4_300_000)}`;
  const encoded = await encodeSharePayload(new TextEncoder().encode(original));
  stubFetch(new Response(encoded as Uint8Array<ArrayBuffer>, { headers: { ETag: '"1"' } }));
  open(SHARE_ID);
  await waitFor(() => expect(mocks.decodeFile).toHaveBeenCalledWith(original));
});
