import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { TeacherClassReports } from './TeacherClassReports';

const mocks = vi.hoisted(() => ({
  unlockConnection: vi.fn(),
  unlockKey: vi.fn(),
  read: vi.fn(),
  close: vi.fn(),
}));
vi.mock('./connectionStore', () => ({
  createGapsConnectionStore: () => ({ unlock: mocks.unlockConnection, close: mocks.close }),
}));
vi.mock('../insights/ownerStore', () => ({
  createInsightsOwnerStore: () => ({ unlock: mocks.unlockKey, close: mocks.close }),
}));
vi.mock('./readReports', () => ({ readClassReports: mocks.read }));
const course = { shareId: 'a'.repeat(32), courseName: 'Biology', verifiedAt: 0 };
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
});
async function unlock() {
  fireEvent.change(screen.getByLabelText('Connection passphrase'), {
    target: { value: 'connection secret' },
  });
  fireEvent.change(screen.getByLabelText('Recovery passphrase'), {
    target: { value: 'teacher secret' },
  });
  fireEvent.submit(screen.getByRole('form', { name: 'Unlock class' }));
  await screen.findByRole('button', { name: 'Read reports' });
}

it('requires explicit unlock/read and preserves unknown, self-marked and disputed evidence', async () => {
  mocks.read.mockResolvedValue({
    unreadable: 1,
    reports: [
      {
        slotId: 'slot',
        report: {
          pupil: { id: 'd'.repeat(32), label: 'Pupil A' },
          day: '2026-10-18',
          omitted: 2,
          events: [
            {
              id: 'event',
              itemId: 'q1',
              kind: 'question-set',
              prompt: 'Explain osmosis.',
              answer: 'Water crosses a membrane.',
              earned: null,
              available: 2,
              marking: 'self',
              disputed: true,
              shortened: true,
              conceptIds: [],
              criteria: [{ id: 'criterion', label: 'Membrane', earned: null, available: 2 }],
            },
          ],
        },
      },
    ],
  });
  render(<TeacherClassReports course={course} onClose={vi.fn()} />);
  expect(mocks.unlockConnection).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
  await unlock();
  expect(screen.queryByDisplayValue('connection secret')).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue('teacher secret')).not.toBeInTheDocument();
  expect(mocks.read).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Read reports' }));
  fireEvent.click(await screen.findByRole('button', { name: /Pupil A.*recorded activities/ }));
  expect(screen.getByText(/Unknown \/ 2 marks.*Self marked/)).toBeInTheDocument();
  expect(screen.getByText('Membrane: Unknown / 2')).toBeInTheDocument();
  expect(screen.getByText(/pupil disputed/)).toBeInTheDocument();
  expect(screen.getByText(/criterion detail shortened/)).toBeInTheDocument();
  expect(screen.getByText(/at least 2 activities omitted/)).toBeInTheDocument();
  expect(screen.getByText(/1 packet\(s\) could not be read/)).toBeInTheDocument();
});

it('aborts a read and drops unlocked credentials when the panel unmounts', async () => {
  let signal: AbortSignal | undefined;
  mocks.read.mockImplementation((options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) =>
      signal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }),
    );
  });
  const panel = render(<TeacherClassReports course={course} onClose={vi.fn()} />);
  await unlock();
  fireEvent.click(screen.getByRole('button', { name: 'Read reports' }));
  expect(signal?.aborted).toBe(false);
  panel.unmount();
  expect(signal?.aborted).toBe(true);
});

it('offers an actionable setup route when this browser has no saved teacher key', async () => {
  mocks.unlockKey.mockResolvedValue(null);
  const onPrepareKey = vi.fn();
  render(<TeacherClassReports course={course} onClose={vi.fn()} onPrepareKey={onPrepareKey} />);
  fireEvent.change(screen.getByLabelText('Connection passphrase'), {
    target: { value: 'connection secret' },
  });
  fireEvent.change(screen.getByLabelText('Recovery passphrase'), {
    target: { value: 'teacher secret' },
  });
  fireEvent.submit(screen.getByRole('form', { name: 'Unlock class' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Set up or restore this class' }));
  expect(onPrepareKey).toHaveBeenCalledOnce();
  expect(mocks.read).not.toHaveBeenCalled();
});

it('keeps invitations behind an explicit choice while daily results are the returning task', async () => {
  render(<TeacherClassReports course={course} onClose={vi.fn()} />);
  await unlock();
  expect(screen.queryByRole('button', { name: 'Publish class code' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Share class code' }));
  expect(screen.getByRole('button', { name: 'Publish class code' })).toBeVisible();
  expect(mocks.read).not.toHaveBeenCalled();
});

it('explains an empty reporting day and offers the class code without claiming no study', async () => {
  mocks.read.mockResolvedValue({ unreadable: 0, reports: [] });
  render(<TeacherClassReports course={course} onClose={vi.fn()} />);
  await unlock();
  fireEvent.click(screen.getByRole('button', { name: 'Read reports' }));
  expect(await screen.findByText(/This does not mean pupils have not studied/)).toBeVisible();
  expect(screen.getByText(/Try another day or read again later/)).toBeVisible();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Share class code' })[1]);
  expect(screen.getByRole('button', { name: 'Publish class code' })).toBeVisible();
});
