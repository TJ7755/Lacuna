import { fireEvent, screen, within } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { beforeEach, vi } from 'vitest';
import { isoDayLabel } from '@lacuna/protocol/insights/index';
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

export const course = { shareId: 'a'.repeat(32), courseName: 'Biology', verifiedAt: 0 };
export const latest = isoDayLabel(Date.now());
export const callbacks = { onRemoved: vi.fn() };
export const unlockRequest: ClassRequest = { kind: 'unlock', id: 1 };

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
export function Harness({
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

export function event(overrides: Partial<DailyEvidenceEvent> = {}): DailyEvidenceEvent {
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

export function report(label: string, events: DailyEvidenceEvent[], omitted = 0): DailyEvidence {
  const id = label.charCodeAt(0).toString(16).padStart(32, '0');
  return { v: 1, shareId: course.shareId, day: latest, pupil: { id, label }, events, omitted };
}

export async function unlock() {
  const form = await screen.findByRole('form', { name: 'Unlock class' });
  fireEvent.change(within(form).getByLabelText('Connection passphrase'), {
    target: { value: 'connection secret' },
  });
  fireEvent.change(within(form).getByLabelText('Recovery passphrase'), {
    target: { value: 'teacher secret' },
  });
  fireEvent.submit(form);
}

export { mocks };
