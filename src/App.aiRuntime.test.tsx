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
const runtime = vi.hoisted(() => ({
  session: { dispose: vi.fn() } as unknown as AiSession,
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouterDom>()),
  RouterProvider: () => {
    const [instance] = useState(() => crypto.randomUUID());
    const session = useOptionalAiSession();
    return (
      <main
        data-testid="router-surface"
        data-instance={instance}
        data-ai-connected={session === runtime.session ? 'true' : 'false'}
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
    useEffect(() => {
      onSessionReady(retainedSession ?? runtime.session);
    }, [onSessionReady, retainedSession]);
    return <span data-testid="enabled-ai-runtime" />;
  },
}));

import { App } from './App';
import { writeAiSettings } from './ai/settings';

describe('optional AI runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(screen.getByTestId('router-surface')).toHaveAttribute('data-ai-connected', 'true');

    act(() => writeAiSettings({ enabled: false }));

    await waitFor(() =>
      expect(screen.getByTestId('router-surface')).toHaveAttribute('data-ai-connected', 'false'),
    );
    expect(screen.getByTestId('router-surface')).toBe(originalSurface);
    expect(screen.getByTestId('router-surface')).toHaveProperty('scrollTop', 420);
    expect(runtime.session.dispose).toHaveBeenCalledOnce();
  });
});
