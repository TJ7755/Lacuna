import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ReactRouterDom from 'react-router-dom';
import type * as MigrationModule from './db/lessonViewModeMigration';
import type * as SchemaModule from './db/schema';
import { useOptionalAiSession } from './ai/session/AiSessionContext';

const dependencies = vi.hoisted(() => ({
  ensurePreMigrationSnapshot: vi.fn(),
  openDatabase: vi.fn(),
  requestPersistentStorage: vi.fn(),
  stampMissingLessonViewModes: vi.fn(),
  isFirstRun: vi.fn(),
  seedIfFirstRun: vi.fn(),
}));
const runtime = vi.hoisted(() => ({ mount: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouterDom>()),
  RouterProvider: () => {
    const [instance] = useState(() => crypto.randomUUID());
    const session = useOptionalAiSession();
    return (
      <main
        data-testid="router-surface"
        data-instance={instance}
        data-ai-session={session?.provider ?? 'none'}
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
vi.mock('./db/lessonViewModeMigration', async (importOriginal) => ({
  ...(await importOriginal<typeof MigrationModule>()),
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
vi.mock('./ai/session/EnabledAiRuntime', () => ({ EnabledAiRuntime: runtime.mount }));

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

  it.each(['external', 'hosted'] as const)(
    'ignores a saved enabled %s chat preference',
    async (provider) => {
      writeAiSettings({ enabled: true, provider });
      render(<App />);

      const surface = await screen.findByTestId('router-surface');
      expect(surface).toHaveAttribute('data-ai-session', 'none');
      expect(screen.queryByTestId('enabled-ai-runtime')).not.toBeInTheDocument();
      expect(runtime.mount).not.toHaveBeenCalled();
    },
  );
});
