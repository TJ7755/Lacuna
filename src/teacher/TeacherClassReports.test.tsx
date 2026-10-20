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
  shortCode: vi.fn(),
  remember: vi.fn(),
  readRemembered: vi.fn(),
  forgetRemembered: vi.fn(),
}));
vi.mock('./rememberedClass', () => ({
  rememberClass: mocks.remember,
  readRememberedClass: mocks.readRemembered,
  forgetRememberedClass: mocks.forgetRemembered,
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
vi.mock('../shareLinks/client', () => ({ requestShortClassCode: mocks.shortCode }));
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
  mocks.remember.mockResolvedValue(false);
  mocks.readRemembered.mockResolvedValue(null);
  mocks.forgetRemembered.mockResolvedValue(undefined);
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
  mocks.shortCode.mockResolvedValue('K7QM4XTP');
  mocks.forget.mockResolvedValue(undefined);
});

/** Holds the session as the shell does, so locking and re-rendering behave as in Gaps. */
function Harness({
  request = unlockRequest,
  cache: existingCache,
}: {
  request?: ClassRequest | null;
  cache?: ReturnType<typeof createClassSessions>;
}) {
  const [cache] = useState(() => existingCache ?? createClassSessions());
  const [session, setSession] = useState<ClassSession | null>(
    cache.sessions.get(course.shareId) ?? null,
  );
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
  expect(code).toBe('K7QM-4XTP');
  expect((screen.getByLabelText('Pupil join link') as HTMLInputElement).value).toMatch(
    /\/s\/GAPS1_/,
  );
  expect(screen.queryByText(/GAPS1_/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Copy code' })).toBeVisible();
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
  expect(await screen.findByRole('heading', { name: 'Unlock to see results' })).toBeVisible();
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
  const field = await screen.findByLabelText('Connection passphrase');
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

it('shows unreadable packets even when none of the reports can be decrypted', async () => {
  mocks.read.mockResolvedValue({ reports: [], unreadable: 3 });
  render(<Harness />);
  await unlock();
  expect(await screen.findByText('3 reports could not be read and are left out.')).toBeVisible();
  expect(screen.getByRole('heading', { name: /^No readable reports for/ })).toBeVisible();
});

it('clears a failed day when returning to a successfully cached day', async () => {
  render(<Harness />);
  await unlock();
  await screen.findByText(/No report does not mean no study/);
  mocks.read.mockRejectedValue(new Error('Earlier day unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Earlier day unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.getByText(/No report does not mean no study/)).toBeVisible();
  expect(mocks.read).toHaveBeenCalledTimes(2);
});

it('keeps grid answer cells keyboard reachable with visible scores and unknown states', async () => {
  mocks.read.mockResolvedValue({
    unreadable: 0,
    reports: [
      { slotId: 'a', report: report('Ada', [event({ earned: 1, available: 2 })]) },
      { slotId: 'b', report: report('Ben', [event()]) },
    ],
  });
  render(<Harness />);
  await unlock();
  const scored = await screen.findByRole('button', { name: 'Ada, Explain osmosis.: 50%' });
  expect(scored.tabIndex).toBe(0);
  expect(scored).toHaveTextContent('50%');
  const unknown = screen.getByRole('button', { name: 'Ben, Explain osmosis.: unknown' });
  expect(unknown.tabIndex).toBe(0);
  expect(unknown).toHaveTextContent('Unknown');
  scored.focus();
  fireEvent.click(scored);
  expect(await screen.findByRole('region', { name: 'Evidence for Ada' })).toBeVisible();
});

it('labels grouped answers with their marking method, dispute and shortening', async () => {
  mocks.read.mockResolvedValue({
    unreadable: 0,
    reports: [
      { slotId: 'a', report: report('Ada', [event()]) },
      {
        slotId: 'b',
        report: report('Ben', [event({ marking: 'automatic', disputed: false, shortened: false })]),
      },
    ],
  });
  render(<Harness />);
  await unlock();
  fireEvent.click(await screen.findByRole('button', { name: /^Explain osmosis/ }));
  const answers = await screen.findByRole('region', { name: 'Answers' });
  expect(
    within(answers).getByText(/Self marked · disputed by the pupil · shortened for this report/),
  ).toBeVisible();
  expect(within(answers).getByText(/Automatic marking/)).toBeVisible();
  expect(within(answers).queryByText('Ada, Ben')).not.toBeInTheDocument();
});

it('restores an earlier day’s read evidence after navigation without another fetch', async () => {
  const cache = createClassSessions();
  mocks.read.mockResolvedValue({
    unreadable: 0,
    reports: [{ slotId: 'saved', report: report('Retained pupil', [event()]) }],
  });
  const page = render(<Harness cache={cache} />);
  await unlock();
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
  await screen.findByRole('table');
  page.unmount();
  mocks.read.mockRejectedValue(new Error('offline'));
  render(<Harness cache={cache} />);
  fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
  expect(await screen.findByRole('button', { name: 'Retained pupil' })).toBeVisible();
  expect(mocks.read).toHaveBeenCalledTimes(2);
});

it('shows textual outcomes for written answer groups with known and unknown scores', async () => {
  mocks.read.mockResolvedValue({
    unreadable: 0,
    reports: [
      { slotId: 'a', report: report('Ada', [event({ disputed: false, shortened: false })]) },
      {
        slotId: 'b',
        report: report('Ben', [event({ earned: 1, disputed: false, shortened: false })]),
      },
    ],
  });
  render(<Harness />);
  await unlock();
  fireEvent.click(await screen.findByRole('button', { name: /^Explain osmosis/ }));
  const answers = await screen.findByRole('region', { name: 'Answers' });
  expect(within(answers).getByText(/Unknown \/ 2 marks/)).toBeVisible();
  expect(within(answers).getByText(/1 \/ 2 marks/)).toBeVisible();
});

it('remembers by default and shows Close with an inline, cancellable Forget confirmation', async () => {
  mocks.remember.mockResolvedValue(true);
  render(<Harness />);
  expect(
    await screen.findByRole('checkbox', { name: 'Remember this class on this device' }),
  ).toBeChecked();
  await unlock();
  expect(await screen.findByRole('button', { name: 'Close' })).toBeVisible();
  expect(mocks.remember).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Forget on this device' }));
  expect(
    screen.getByText(
      'This browser will ask for both passphrases next time. Your class, reports and recovery file are not affected.',
    ),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(mocks.forgetRemembered).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Forget on this device' }));
  fireEvent.click(screen.getByRole('button', { name: 'Forget' }));
  await waitFor(() => expect(mocks.forgetRemembered).toHaveBeenCalledWith(course.shareId));
  expect(await screen.findByRole('form', { name: 'Unlock class' })).toBeVisible();
});

it('does not persist when unchecked and keeps the existing Lock action', async () => {
  render(<Harness />);
  fireEvent.click(
    await screen.findByRole('checkbox', { name: 'Remember this class on this device' }),
  );
  await unlock();
  expect(await screen.findByRole('button', { name: 'Lock' })).toBeVisible();
  expect(mocks.remember).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Forget on this device' })).not.toBeInTheDocument();
});

it('opens remembered credentials through the same revocable session path without the unlock form', async () => {
  mocks.readRemembered.mockResolvedValue({
    connection: { shareId: course.shareId },
    owner: {},
    remembered: true,
    days: new Map(),
  });
  render(<Harness />);
  expect(screen.queryByRole('form', { name: 'Unlock class' })).not.toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Close' })).toBeVisible();
  expect(mocks.unlockConnection).not.toHaveBeenCalled();
  expect(mocks.unlockKey).not.toHaveBeenCalled();
  await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
});

it('forgets a pending remember completion if removal revoked its session', async () => {
  let finish!: (value: boolean) => void;
  mocks.remember.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<Harness />);
  await unlock();
  await waitFor(() => expect(mocks.remember).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: /^Class settings/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Remove connection' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove from this browser' }));
  await waitFor(() => expect(callbacks.onRemoved).toHaveBeenCalledOnce());
  await act(async () => finish(true));
  expect(mocks.forgetRemembered).toHaveBeenCalledWith(course.shareId);
  expect(mocks.read).not.toHaveBeenCalled();
});

it('keeps failed Forget visible and retryable until cancelled or retried', async () => {
  mocks.remember.mockResolvedValue(true);
  mocks.forgetRemembered.mockRejectedValue(new Error('Deletion failed'));
  render(<Harness />);
  await unlock();
  const trigger = await screen.findByRole('button', { name: 'Forget on this device' });
  fireEvent.click(trigger);
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: /^Forget$/ }));
  const alert = await screen.findByRole('alert');
  expect(trigger.closest('header')).toContainElement(screen.getByRole('button', { name: 'Close' }));
  expect(alert).toHaveTextContent('Could not forget this class. Try again.');
  expect(alert).toHaveClass('text-negative', 'text-sm');
  expect(alert.closest('[role="group"]')).toContainElement(
    screen.getByRole('button', { name: /^Forget$/ }),
  );
  expect(screen.getByRole('button', { name: 'Close' })).toBeVisible();
  expect(screen.queryByRole('form', { name: 'Unlock class' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Forget$/ })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Forget$/ }));
  await screen.findByRole('alert');
  let finish!: () => void;
  mocks.forgetRemembered.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: /^Forget$/ }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Forget$/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await act(async () => finish());
  expect(await screen.findByRole('form', { name: 'Unlock class' })).toBeVisible();
});

it('keeps the pinned link usable when short code creation fails', async () => {
  mocks.shortCode.mockRejectedValue(new Error('offline'));
  render(<Harness />);
  await unlock();
  fireEvent.click(await screen.findByRole('button', { name: 'Share class code' }));
  fireEvent.click(screen.getByRole('button', { name: 'Publish class code' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not create a short code. Pupils can still use the join link.',
  );
  expect((screen.getByLabelText('Pupil join link') as HTMLInputElement).value).toMatch(
    /\/s\/GAPS1_/,
  );
  expect(screen.queryByLabelText('Class code')).not.toBeInTheDocument();
});

it('unlocks a code-protected class with one normalised code and no first-time setup', async () => {
  const onUnlocked = vi.fn();
  render(
    <ClassPage
      course={{ ...course, secret: 'recovery-code' }}
      session={null}
      request={unlockRequest}
      onUnlocked={onUnlocked}
      onChanged={vi.fn()}
      onLock={vi.fn()}
      onRemoved={vi.fn()}
    />,
  );
  const input = await screen.findByLabelText('Recovery code');
  expect(screen.queryAllByLabelText(/passphrase/)).toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'First time? Set up' })).not.toBeInTheDocument();
  expect(input).toHaveAttribute('autocomplete', 'off');
  expect(input).toHaveAttribute('spellcheck', 'false');
  expect(input).toHaveAttribute('autocapitalize', 'characters');
  fireEvent.change(input, { target: { value: 'short' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Unlock class' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Check the recovery code. It has 24 letters and numbers.',
  );
  expect(mocks.unlockConnection).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: 'oill-2345-6789-abcd-efgh-jkmn' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Unlock class' }));
  await waitFor(() => expect(onUnlocked).toHaveBeenCalled());
  expect(mocks.unlockConnection).toHaveBeenCalledWith(course.shareId, '011123456789ABCDEFGHJKMN');
  expect(mocks.unlockKey).toHaveBeenCalledWith(course.shareId, '011123456789ABCDEFGHJKMN');
});

it('shows recovery-code feedback when WebCrypto rejects without a message', async () => {
  mocks.unlockConnection.mockRejectedValue(new DOMException('', 'OperationError'));
  render(
    <ClassPage
      course={{ ...course, secret: 'recovery-code' }}
      session={null}
      request={unlockRequest}
      onUnlocked={vi.fn()}
      onChanged={vi.fn()}
      onLock={vi.fn()}
      onRemoved={vi.fn()}
    />,
  );
  fireEvent.change(await screen.findByLabelText('Recovery code'), {
    target: { value: 'Z'.repeat(24) },
  });
  fireEvent.submit(screen.getByRole('form', { name: 'Unlock class' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not unlock. Check the recovery code.',
  );
});
