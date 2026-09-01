import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ReactRouterDom from 'react-router-dom';
import type * as RepositoryModule from './db/repository';
import type * as SchemaModule from './db/schema';
import { useOptionalAiSession } from './ai/session/AiSessionContext';
import type { AiSession } from './ai/session/types';

const dependencies = vi.hoisted(() => ({
  ensurePreMigrationSnapshot: vi.fn(),
  openDatabase: vi.fn(),
  requestPersistentStorage: vi.fn(),
  stampMissingLessonViewModes: vi.fn(),
  isFirstRun: vi.fn(),
  seedIfFirstRun: vi.fn(),
}));
interface TestAiSession extends AiSession {
  testId: string;
  dispose: ReturnType<typeof vi.fn>;
}
const runtime = vi.hoisted(() => ({
  createdSessions: [] as TestAiSession[],
  mountedSessions: [] as TestAiSession[],
  restartListener: null as (() => void) | null,
}));

function createTestSession(): TestAiSession {
  const session = {
    testId: crypto.randomUUID(),
    dispose: vi.fn(),
  } as unknown as TestAiSession;
  runtime.createdSessions.push(session);
  return session;
}

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouterDom>()),
  RouterProvider: () => {
    const [instance] = useState(() => crypto.randomUUID());
    const session = useOptionalAiSession();
    return (
      <main
        data-testid="router-surface"
        data-instance={instance}
        data-ai-session={(session as TestAiSession | null)?.testId ?? 'none'}
      />
    );
  },
}));
vi.mock('./routes/router', () => ({ router: {} }));
vi.mock('./db/schema', async (importOriginal) => ({
  ...(await importOriginal<typeof SchemaModule>()),
  ensurePreMigrationSnapshot: dependencies.ensurePreMigrationSnapshot,
  openDatabase: dependencies.openDatabase,
}));
vi.mock('./db/persistence', () => ({
  requestPersistentStorage: dependencies.requestPersistentStorage,
}));
vi.mock('./db/repository', async (importOriginal) => ({
  ...(await importOriginal<typeof RepositoryModule>()),
  stampMissingLessonViewModes: dependencies.stampMissingLessonViewModes,
}));
vi.mock('./db/seed', () => ({
  isFirstRun: dependencies.isFirstRun,
  seedIfFirstRun: dependencies.seedIfFirstRun,
}));
vi.mock('./db/assetCache', () => ({ revokeAllCachedUrls: vi.fn() }));
vi.mock('./sync/triggers', () => ({ installSyncTriggers: vi.fn(() => vi.fn()) }));
vi.mock('./hooks/useStorageQuotaWarning', () => ({ useStorageQuotaWarning: vi.fn() }));
vi.mock('./components/layout/LandingTransition', () => ({
  LandingTransition: () => null,
}));
vi.mock('./ai/session/EnabledAiRuntime', () => ({
  EnabledAiRuntime: ({
    retainedSession,
    onSessionReady,
  }: {
    retainedSession: AiSession | null;
    onSessionReady: (session: AiSession) => void;
  }) => {
    const [instance] = useState(() => crypto.randomUUID());
    const [session] = useState(() => retainedSession ?? createTestSession());
    useEffect(() => {
      runtime.mountedSessions.push(session as TestAiSession);
      onSessionReady(session);
    }, [onSessionReady, session]);
    return <span data-testid="enabled-ai-runtime" data-instance={instance} />;
  },
}));

import { App } from './App';
import { writeAiSettings } from './ai/settings';

describe('optional AI runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.createdSessions.length = 0;
    runtime.mountedSessions.length = 0;
    runtime.restartListener = null;
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        platform: 'win32',
        isElectron: true,
        ai: {
          protocolVersion: 1,
          disconnect: vi.fn(),
          requestRestart: vi.fn(),
          onRestartRequested: vi.fn((listener: () => void) => {
            runtime.restartListener = listener;
            return () => {
              if (runtime.restartListener === listener) runtime.restartListener = null;
            };
          }),
          listen: vi.fn(),
        },
      },
    });
    localStorage.removeItem('lacuna.aiSettings');
    localStorage.setItem('lacuna-lesson-view-mode-migrated', '1');
    window.location.hash = '#/';
    dependencies.ensurePreMigrationSnapshot.mockResolvedValue(undefined);
    dependencies.openDatabase.mockResolvedValue({ ok: true });
    dependencies.requestPersistentStorage.mockResolvedValue({
      supported: true,
      persisted: true,
      granted: true,
    });
    dependencies.isFirstRun.mockResolvedValue(false);
    dependencies.seedIfFirstRun.mockResolvedValue(undefined);
  });

  it('keeps the routed application mounted when AI is enabled', async () => {
    render(<App />);
    const originalSurface = await screen.findByTestId('router-surface');
    originalSurface.scrollTop = 420;

    act(() => writeAiSettings({ enabled: true }));
    await screen.findByTestId('enabled-ai-runtime');

    await waitFor(() => expect(screen.getByTestId('router-surface')).toBe(originalSurface));
    expect(screen.getByTestId('router-surface')).toHaveProperty('scrollTop', 420);
    expect(screen.getByTestId('router-surface')).not.toHaveAttribute('data-ai-session', 'none');
    const activeSession = runtime.createdSessions[0];

    act(() => writeAiSettings({ enabled: false }));

    await waitFor(() =>
      expect(screen.getByTestId('router-surface')).toHaveAttribute('data-ai-session', 'none'),
    );
    expect(screen.getByTestId('router-surface')).toBe(originalSurface);
    expect(screen.getByTestId('router-surface')).toHaveProperty('scrollTop', 420);
    expect(activeSession.dispose).toHaveBeenCalledOnce();
  });

  it('remounts only the enabled AI runtime when Electron requests recovery', async () => {
    writeAiSettings({ enabled: true });
    render(<App />);

    const originalSurface = await screen.findByTestId('router-surface');
    const originalRuntime = await screen.findByTestId('enabled-ai-runtime');
    const originalRuntimeInstance = originalRuntime.getAttribute('data-instance');
    await waitFor(() => expect(runtime.restartListener).not.toBeNull());
    const originalSession = runtime.createdSessions[0];
    const originalSessionId = originalSession.testId;
    expect(screen.getByTestId('router-surface')).toHaveAttribute(
      'data-ai-session',
      originalSessionId,
    );

    act(() => runtime.restartListener?.());

    await waitFor(() =>
      expect(screen.getByTestId('enabled-ai-runtime')).not.toHaveAttribute(
        'data-instance',
        originalRuntimeInstance,
      ),
    );
    expect(screen.getByTestId('router-surface')).toBe(originalSurface);
    expect(runtime.createdSessions).toHaveLength(1);
    expect(runtime.mountedSessions).toEqual([originalSession, originalSession]);
    expect(originalSession.dispose).toHaveBeenCalledOnce();
    expect(screen.getByTestId('router-surface')).toHaveAttribute(
      'data-ai-session',
      originalSessionId,
    );
  });
});
