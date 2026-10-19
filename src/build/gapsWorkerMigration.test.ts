import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

const script = readFileSync('gaps/sw.js', 'utf8');
function worker(origin = 'https://gaps.getlacuna.app', path = '/sw.js', scope = `${origin}/`) {
  const events = new Map<
    string,
    (event: { waitUntil: (work: Promise<unknown>) => void }) => void
  >();
  const windows = ['', '#/teach', '#/share', '#/course/edit'].map((hash) => ({
    url: `${origin}/${hash}`,
    navigate: vi.fn().mockResolvedValue(undefined),
  }));
  windows.push({ url: 'https://getlacuna.app/#/teach', navigate: vi.fn() });
  const caches = { delete: vi.fn(), keys: vi.fn() };
  const indexedDB = { open: vi.fn(), deleteDatabase: vi.fn() };
  const self = {
    location: new URL(`${origin}${path}`),
    registration: { scope, unregister: vi.fn().mockResolvedValue(true) },
    clients: {
      claim: vi.fn().mockResolvedValue(undefined),
      matchAll: vi.fn().mockResolvedValue(windows),
    },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    addEventListener: (
      name: string,
      handler: (event: { waitUntil: (work: Promise<unknown>) => void }) => void,
    ) => events.set(name, handler),
  };
  runInNewContext(script, { self, URL, caches, indexedDB });
  const dispatch = async (name: string) => {
    let work: Promise<unknown> = Promise.resolve();
    events.get(name)?.({
      waitUntil: (promise) => {
        work = promise;
      },
    });
    await work;
  };
  return { self, caches, indexedDB, windows, events, dispatch };
}

it('retires the old Gaps worker, refreshes teacher home and preserves learner data and edits', async () => {
  const target = worker();
  await target.dispatch('install');
  expect(target.self.skipWaiting).toHaveBeenCalledOnce();
  await target.dispatch('activate');
  expect(target.self.clients.claim).toHaveBeenCalledOnce();
  expect(target.self.registration.unregister).toHaveBeenCalledOnce();
  expect(
    target.windows.slice(0, 2).every((client) => client.navigate.mock.calls.length === 1),
  ).toBe(true);
  expect(target.windows.slice(2).every((client) => client.navigate.mock.calls.length === 0)).toBe(
    true,
  );
  expect(target.events.has('fetch')).toBe(false);
  for (const method of [...Object.values(target.caches), ...Object.values(target.indexedDB)]) {
    expect(method).not.toHaveBeenCalled();
  }
});

it.each([
  ['https://getlacuna.app', '/sw.js', 'https://getlacuna.app/'],
  ['https://gaps.getlacuna.app', '/sw.js', 'https://gaps.getlacuna.app/study/'],
  ['https://gaps.getlacuna.app', '/other.js', 'https://gaps.getlacuna.app/'],
  ['http://gaps.getlacuna.app', '/sw.js', 'http://gaps.getlacuna.app/'],
  ['http://localhost:4327', '/sw.js', 'http://localhost:4327/'],
])(
  'refuses retirement outside the exact legacy teacher registration (%s %s %s)',
  async (origin, path, scope) => {
    const target = worker(origin, path, scope);
    await expect(target.dispatch('install')).rejects.toThrow('restricted to the Gaps root scope');
    await target.dispatch('activate');
    expect(target.self.skipWaiting).not.toHaveBeenCalled();
    expect(target.self.clients.claim).not.toHaveBeenCalled();
    expect(target.self.registration.unregister).not.toHaveBeenCalled();
    expect(target.self.clients.matchAll).not.toHaveBeenCalled();
  },
);
