import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usageBatchSchema } from '@lacuna/protocol/usage';
import { installUsageCollector, recordUsageAction, usageActionForControl } from './collector';
import { createUsageOutbox, usageDay, USAGE_DATABASE_NAME } from './outbox';

const preference = vi.hoisted(() => ({ permitted: false, saved: 'unset', notify: () => {} }));
vi.mock('./preference', () => ({
  canCollectUsage: () => preference.permitted,
  readUsagePreference: () => preference.saved,
  subscribeToUsagePreference: (notify: () => void) => {
    preference.notify = notify;
    return () => {};
  },
}));

let dispose: () => void;
const upload = vi.fn<typeof fetch>();

beforeEach(() => {
  preference.permitted = false;
  preference.saved = 'unset';
  upload.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', upload);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});

afterEach(async () => {
  dispose?.();
  await Dexie.delete(USAGE_DATABASE_NAME);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('does not read or send analytics before a choice, and reports only approved route and action keys', async () => {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        children: [{ path: 'course/:courseId' }, { path: 'course/:courseId/lesson/:lessonId' }],
      },
    ],
    { initialEntries: ['/course/course-private-id?query=private-search'] },
  );
  dispose = installUsageCollector(router);
  recordUsageAction('search-used');
  window.dispatchEvent(new Event('online'));
  expect(upload).not.toHaveBeenCalled();
  expect(await Dexie.exists(USAGE_DATABASE_NAME)).toBe(false);

  preference.permitted = true;
  preference.notify();
  await router.navigate('/course/course-private-id?query=other-private-search');
  await router.navigate('/course/course-private-id/lesson/lesson-private-id');
  recordUsageAction('edit-opened', 'shortcut');
  recordUsageAction('edit-saved');
  window.dispatchEvent(new Event('pagehide'));

  await vi.waitFor(() => {
    const rows = upload.mock.calls.flatMap(([, init]) => {
      expect(init?.credentials).toBe('omit');
      expect(init?.referrerPolicy).toBe('no-referrer');
      const payload = String(init?.body);
      expect(payload).not.toContain('private-');
      return usageBatchSchema.parse(JSON.parse(payload)).rows;
    });
    expect(rows.filter(([key]) => key === 'view/course')).toEqual([['view/course', 1, 1]]);
    expect(rows).toEqual(
      expect.arrayContaining([
        ['transition/course/lesson', 1, 1],
        ['source/lesson/edit-opened/shortcut', 1, 1],
        ['online/lesson/edit-opened', 1, 1],
        ['pair/edit-opened/edit-saved', 1, 1],
        ['breadth/two-to-four', 1, 1],
      ]),
    );
  });
});

it('aborts an in-flight report and prevents further collection after opt-out', async () => {
  upload.mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      }),
  );
  preference.permitted = true;
  const router = createMemoryRouter([{ path: '/', children: [{ path: 'settings' }] }], {
    initialEntries: ['/settings'],
  });
  dispose = installUsageCollector(router);
  await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
  preference.permitted = false;
  preference.notify();
  expect(upload.mock.calls[0][1]?.signal?.aborted).toBe(true);
  recordUsageAction('search-used');
  window.dispatchEvent(new Event('online'));
  expect(upload).toHaveBeenCalledTimes(1);
});

it('persists foreground and breadth at pagehide while an earlier upload is still waiting', async () => {
  upload.mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      }),
  );
  preference.permitted = true;
  const router = createMemoryRouter([{ path: '/', children: [{ path: 'settings' }] }], {
    initialEntries: ['/settings'],
  });
  dispose = installUsageCollector(router);
  await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('pagehide'));

  const inspection = new Dexie(USAGE_DATABASE_NAME);
  try {
    await inspection.open();
    await vi.waitFor(async () => {
      const batches = await inspection.table('batches').toArray();
      const keys = batches.flatMap((batch: unknown) =>
        usageBatchSchema.parse(batch).rows.map(([key]) => key),
      );
      expect(keys).toContain('breadth/one');
      expect(keys.some((key) => key.startsWith('foreground/settings/'))).toBe(true);
      expect(upload).toHaveBeenCalledTimes(1);
    });
  } finally {
    inspection.close();
  }
});

it('discards a pre-existing pending report when the browser starts blocked', async () => {
  const outbox = createUsageOutbox();
  try {
    await outbox.persist(
      new Map([
        [
          usageDay(Date.now()),
          {
            rows: new Map([['view/settings', 1]]),
            used: new Set(['settings']),
          },
        ],
      ]),
      () => true,
    );
    expect(await outbox.next()).toBeDefined();
    preference.saved = 'on';
    const router = createMemoryRouter([{ path: '/', children: [{ path: 'settings' }] }], {
      initialEntries: ['/settings'],
    });
    dispose = installUsageCollector(router);
    await vi.waitFor(async () => expect(await outbox.next()).toBeUndefined());
    expect(upload).not.toHaveBeenCalled();
  } finally {
    outbox.close();
  }
});

it('classifies controls without reading their labels, values or destinations', () => {
  const button = document.createElement('button');
  button.textContent = 'private pupil label';
  button.dataset.usageAction = 'unapproved-private-action';
  expect(usageActionForControl(button)).toBe('button');
  button.dataset.usageAction = 'import-opened';
  expect(usageActionForControl(button)).toBe('import-opened');
  button.disabled = true;
  expect(usageActionForControl(button)).toBeUndefined();
  button.disabled = false;
  const content = document.createElement('div');
  content.className = 'prose-lacuna';
  content.append(button);
  expect(usageActionForControl(button)).toBeUndefined();
});
