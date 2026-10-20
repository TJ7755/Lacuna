import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  completedIsoDayLabel,
  DAY_MS,
  isoDayLabel,
  isoDayStartMs,
} from '../../relay/src/insightsDay';
import type { DailyEvidence, DailyEvidenceEvent } from '../insights/evidence';
import { ClassPage } from './TeacherClassReports';
import { createClassSessions } from './classSessions';
import type { ClassRequest, ClassSession } from './StandaloneTeacherHome';

const mocks = vi.hoisted(() => ({
  unlockConnection: vi.fn(),
  unlockKey: vi.fn(),
  forget: vi.fn(),
  read: vi.fn(),
  publish: vi.fn(),
  close: vi.fn(),
}));
vi.mock('./connectionStore', () => ({
  createGapsConnectionStore: () => ({
    unlock: mocks.unlockConnection,
    forget: mocks.forget,
    close: mocks.close,
  }),
}));
vi.mock('../insights/ownerStore', () => ({
  createInsightsOwnerStore: () => ({ unlock: mocks.unlockKey, close: mocks.close }),
}));
vi.mock('./readReports', () => ({ readClassReports: mocks.read }));
vi.mock('../insights/classKey', () => ({ publishClassRecipient: mocks.publish }));
vi.mock('./TeacherKeySetup', () => ({
  TeacherKeySetup: ({ initialMode }: { initialMode: string }) => (
    <label>
      Key set-up {initialMode}
      <input />
    </label>
  ),
}));

const course = { shareId: 'a'.repeat(32), courseName: 'Biology', verifiedAt: 0 };
const latest = completedIsoDayLabel(Date.now());
const callbacks = { onRemoved: vi.fn() };
const unlockRequest: ClassRequest = { kind: 'unlock', id: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.unlockConnection.mockResolvedValue({
    ...course,
    writeToken: 'b'.repeat(64),
    relayUrl: 'https://relay.getlacuna.app',
  });
  mocks.unlockKey.mockResolvedValue({
    recipient: { keyId: 'c'.repeat(64), publicKey: 'public' },
    privateKey: {},
  });
  mocks.read.mockResolvedValue({ unreadable: 0, reports: [] });
  mocks.publish.mockResolvedValue(undefined);
  mocks.forget.mockResolvedValue(undefined);
});

/** Holds the session as the shell does, so locking and re-rendering behave as in Gaps. */
function Harness({ request = unlockRequest }: { request?: ClassRequest | null }) {
  const [cache] = useState(createClassSessions);
  const [session, setSession] = useState<ClassSession | null>(null);
  const [, setRevision] = useState(0);
  const onChanged = useCallback(() => setRevision((value) => value + 1), []);
  return (
    <ClassPage
      course={course}
      session={session}
      request={request}
      beginUnlock={() => cache.beginUnlock(course.shareId)}
      onUnlocked={() => setSession(cache.sessions.get(course.shareId) ?? null)}
      onChanged={onChanged}
      onLock={() => {
        cache.lock(course.shareId);
        setSession(null);
      }}
      onRemoved={() => {
        cache.lock(course.shareId);
        setSession(null);
        callbacks.onRemoved();
      }}
    />
  );
}

function event(overrides: Partial<DailyEvidenceEvent> = {}): DailyEvidenceEvent {
  return {
    id: 'event',
    itemId: 'q1',
    kind: 'question-set',
    at: 0,
    prompt: 'Explain osmosis.',
    answer: 'Water crosses a membrane.',
    earned: null,
    available: 2,
    retained: null,
    marking: 'self',
    disputed: true,
    shortened: true,
    conceptIds: [],
    criteria: [{ id: 'criterion', label: 'Membrane', earned: null, available: 2 }],
    ...overrides,
  };
}

function report(label: string, events: DailyEvidenceEvent[], omitted = 0): DailyEvidence {
  const id = label.charCodeAt(0).toString(16).padStart(32, '0');
  return { v: 1, shareId: course.shareId, day: latest, pupil: { id, label }, events, omitted };
}

async function unlock() {
  const form = await screen.findByRole('form', { name: 'Unlock class' });
  fireEvent.change(within(form).getByLabelText('Connection passphrase'), {
    target: { value: 'connection secret' },
  });
  fireEvent.change(within(form).getByLabelText('Recovery passphrase'), {
    target: { value: 'teacher secret' },
  });
  fireEvent.submit(form);
}

it('reads only after an explicit unlock and preserves unknown, self-marked and disputed evidence', async () => {
  mocks.read.mockResolvedValue({
    unreadable: 1,
    reports: [{ slotId: 'slot', report: report('Pupil A', [event()], 2) }],
  });
  render(<Harness />);
  expect(mocks.unlockConnection).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
  await unlock();
  await waitFor(() =>
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ isoDay: latest })),
  );
  expect(screen.queryByDisplayValue('connection secret')).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue('teacher secret')).not.toBeInTheDocument();
  expect(await screen.findByText('1 report could not be read and is left out.')).toBeVisible();
  expect(screen.getByRole('table')).toBeVisible();

  const pupil = screen.getByRole('button', { name: 'Pupil A' });
  fireEvent.click(pupil);
  expect(pupil).toHaveAttribute('aria-expanded', 'true');
  const dialog = await screen.findByRole('region', { name: 'Evidence for Pupil A' });
  expect(within(dialog).getByText(/Unknown \/ 2 marks · Self marked/)).toBeInTheDocument();
  expect(within(dialog).getByText(/disputed by the pupil/)).toBeInTheDocument();
  expect(within(dialog).getByText(/shortened for this report/)).toBeInTheDocument();
  expect(within(dialog).getByText(/Membrane/)).toHaveTextContent('Membrane Unknown / 2');
  expect(within(dialog).getByText(/at least 2 more activities/)).toBeInTheDocument();
});

it('aborts a read and drops unlocked credentials when the page unmounts', async () => {
  let signal: AbortSignal | undefined;
  mocks.read.mockImplementation((options: { signal: AbortSignal }) => {
    signal = options.signal;
    return new Promise((_resolve, reject) =>
      signal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }),
    );
  });
  const page = render(<Harness />);
  await unlock();
  await waitFor(() => expect(signal?.aborted).toBe(false));
  page.unmount();
  expect(signal?.aborted).toBe(true);
});

it('swaps in set-up when this browser has no saved teacher key', async () => {
  mocks.unlockKey.mockResolvedValue(null);
  render(<Harness />);
  await unlock();
  expect(await screen.findByRole('alert')).toHaveTextContent('no key for this class');
  fireEvent.click(screen.getByRole('button', { name: 'Set up or restore this class' }));
  expect(screen.getByRole('heading', { name: 'Protect this class' })).toBeVisible();
  await waitFor(() => expect(screen.getByLabelText('Key set-up create')).toHaveFocus());
  expect(mocks.read).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Back to unlock' }));
  expect(screen.getByLabelText('Connection passphrase')).toHaveFocus();
});

it('explains an empty day without claiming no study and leads to the class code', async () => {
  render(<Harness />);
  await unlock();
  expect(await screen.findByText(/No report does not mean no study/)).toBeVisible();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Share class code' }));
  fireEvent.click(screen.getByRole('button', { name: 'Publish class code' }));
  await waitFor(() =>
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ shareId: course.shareId, recipient: expect.anything() }),
    ),
  );
  const code = ((await screen.findByLabelText('Class code')) as HTMLInputElement).value;
  expect(code).toMatch(/^GAPS1_/);
  expect(screen.getByLabelText('Pupil join link')).toHaveValue(`https://getlacuna.app/#/s/${code}`);
});

it('reads an earlier day on request and keeps days already read for this session', async () => {
  render(<Harness />);
  await unlock();
  await screen.findByText(/No report does not mean no study/);
  const previous = isoDayLabel(isoDayStartMs(latest) - DAY_MS);
  fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
  await waitFor(() =>
    expect(mocks.read).toHaveBeenLastCalledWith(expect.objectContaining({ isoDay: previous })),
  );
  expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
  await screen.findByText(/No report does not mean no study/);
  expect(mocks.read).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
});

it('groups identical answers so a shared misconception reads as one line', async () => {
  const wrong = event({
    disputed: false,
    shortened: false,
    earned: 0,
    answer: 'Salt moves',
    criteria: [],
  });
  mocks.read.mockResolvedValue({
    unreadable: 0,
    reports: [
      { slotId: '1', report: report('Ada', [wrong]) },
      { slotId: '2', report: report('Ben', [{ ...wrong, answer: 'salt moves' }]) },
      { slotId: '3', report: report('Cy', [{ ...wrong, earned: 2, answer: 'Water moves' }]) },
    ],
  });
  render(<Harness />);
  await unlock();
  const answers = await screen.findByRole('button', { name: /^Answers/ });
  fireEvent.click(answers);
  expect(answers).toHaveAttribute('aria-expanded', 'true');
  const row = answers.closest('li')!;
  expect(within(row).getByText('Ada, Ben')).toBeInTheDocument();
  expect(within(row).getByText('Cy')).toBeInTheDocument();

  // The item's heading in the grid opens the same answers in a row beneath it.
  fireEvent.click(screen.getByRole('button', { name: /^Explain osmosis/ }));
  const grid = await screen.findByRole('region', { name: 'Answers' });
  expect(within(grid).getByText('Ada, Ben')).toBeInTheDocument();
  fireEvent.keyDown(grid, { key: 'Escape' });
  expect(screen.getByRole('button', { name: /^Explain osmosis/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

it('locks the class and removes the connection only after confirmation', async () => {
  render(<Harness />);
  await unlock();
  fireEvent.click(await screen.findByRole('button', { name: 'Lock' }));
  expect(screen.getByRole('heading', { name: 'Unlock to see results' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /^Class settings/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Remove connection' }));
  fireEvent.click(screen.getByRole('button', { name: 'Keep connection' }));
  expect(mocks.forget).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove connection' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove from this browser' }));
  await waitFor(() => expect(mocks.forget).toHaveBeenCalledWith(course.shareId));
  expect(callbacks.onRemoved).toHaveBeenCalledOnce();
});

it('moves to the requested step when a mounted locked class receives a new request', async () => {
  const page = render(<Harness request={null} />);
  const field = screen.getByLabelText('Connection passphrase');
  expect(field).not.toHaveFocus();
  page.rerender(<Harness request={unlockRequest} />);
  await waitFor(() => expect(screen.getByLabelText('Connection passphrase')).toHaveFocus());
  page.rerender(<Harness request={{ kind: 'setup', id: 2 }} />);
  await waitFor(() => expect(screen.getByLabelText('Key set-up create')).toHaveFocus());
});

it('reads the same day again on request, for reports that arrive later', async () => {
  render(<Harness />);
  await unlock();
  await screen.findByText(/No report does not mean no study/);
  mocks.read.mockResolvedValue({
    unreadable: 0,
    reports: [{ slotId: 'slot', report: report('Ada', [event()]) }],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Read again' }));
  expect(await screen.findByRole('table')).toBeVisible();
  expect(mocks.read).toHaveBeenCalledTimes(2);
  expect(mocks.read).toHaveBeenLastCalledWith(expect.objectContaining({ isoDay: latest }));
});

it('does not restore a class when key recovery finishes after removal', async () => {
  let finish!: (value: unknown) => void;
  mocks.unlockKey.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<Harness />);
  await unlock();
  await waitFor(() => expect(mocks.unlockKey).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: /^Class settings/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Remove connection' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove from this browser' }));
  await waitFor(() => expect(callbacks.onRemoved).toHaveBeenCalledOnce());
  await act(async () => finish({ privateKey: {}, recipient: { keyId: 'key' } }));
  expect(screen.queryByRole('button', { name: /^Lock$/ })).not.toBeInTheDocument();
  expect(mocks.read).not.toHaveBeenCalled();
});

it('does not publish an unlock completion after the class page unmounts', async () => {
  let finish!: (value: unknown) => void;
  mocks.unlockKey.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const onUnlocked = vi.fn();
  const page = render(
    <ClassPage
      course={course}
      session={null}
      request={unlockRequest}
      onUnlocked={onUnlocked}
      onChanged={vi.fn()}
      onLock={vi.fn()}
      onRemoved={vi.fn()}
    />,
  );
  await unlock();
  await waitFor(() => expect(mocks.unlockKey).toHaveBeenCalledOnce());
  page.unmount();
  await act(async () => finish({ privateKey: {}, recipient: { keyId: 'key' } }));
  expect(onUnlocked).not.toHaveBeenCalled();
});
