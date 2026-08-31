import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as RepositoryModule from './db/repository';
import type * as SchemaModule from './db/schema';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const dependencies = vi.hoisted(() => ({
  ensurePreMigrationSnapshot: vi.fn(),
  openDatabase: vi.fn(),
  requestPersistentStorage: vi.fn(),
  stampMissingLessonViewModes: vi.fn(),
  isFirstRun: vi.fn(),
  seedIfFirstRun: vi.fn(),
}));

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
vi.mock('./components/layout/AppShell', () => ({ AppShell: () => null }));
vi.mock('./pages/Dashboard', () => ({ Dashboard: () => null }));

import { App } from './App';
import { replacementLifecycle } from './db/replacementLifecycle';

describe('App initialisation', () => {
  beforeEach(() => {
    localStorage.removeItem('lacuna.aiSettings');
    localStorage.removeItem('lacuna-ai-relay-session-v1');
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

  it('requests persistence after opening the database without blocking readiness', async () => {
    const persistence = deferred<void>();
    dependencies.requestPersistentStorage.mockReturnValue(persistence.promise);

    render(<App />);

    await act(async () => {
      await dependencies.openDatabase.mock.results[0]?.value;
    });

    expect(dependencies.openDatabase).toHaveBeenCalledOnce();
    expect(dependencies.requestPersistentStorage).toHaveBeenCalledOnce();
    expect(dependencies.openDatabase.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.requestPersistentStorage.mock.invocationCallOrder[0],
    );
    await waitFor(() => expect(screen.queryByText('Lacuna')).not.toBeInTheDocument());

    persistence.reject(new Error('denied'));
  });

  it('clears persisted relay device state after replacement while AI is disabled', async () => {
    localStorage.setItem('lacuna-ai-relay-session-v1', '{"persisted":true}');

    render(<App />);

    await act(() => replacementLifecycle.replace('manual', async () => undefined));

    expect(localStorage.getItem('lacuna-ai-relay-session-v1')).toBeNull();
  });

  it('does not redirect a first-time visitor away from the public download page', async () => {
    window.location.hash = '#/download';
    dependencies.isFirstRun.mockResolvedValue(true);
    dependencies.seedIfFirstRun.mockClear();

    render(<App />);

    await waitFor(() => expect(dependencies.seedIfFirstRun).toHaveBeenCalledOnce());
    expect(window.location.hash).toBe('#/download');
  });
});
