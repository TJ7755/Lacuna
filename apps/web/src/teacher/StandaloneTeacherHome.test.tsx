import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  StandaloneTeacherHome,
  type ClassRequest,
  type ClassSession,
} from './StandaloneTeacherHome';
import { ThemeProvider } from '../state/ThemeContext';
import { DAY_MS, isoDayLabel, isoDayStartMs } from '@lacuna/protocol/insights/index';
import type { ReadClassReports } from './readReports';

const course = { shareId: 'a'.repeat(32), courseName: 'Biology', verifiedAt: 0 };
const { store, loadedDays } = vi.hoisted(() => ({
  store: { list: vi.fn(), close: vi.fn() },
  loadedDays: new Map<string, ReadClassReports>(),
}));
vi.mock('./connectionStore', () => ({ createGapsConnectionStore: () => store }));
vi.mock('./TeacherCourses', () => ({
  TodayPage: ({
    connectRequest,
    day,
    sessions,
    onOpen,
    onConnected,
    onExploreDemo,
  }: {
    connectRequest: number;
    day: string;
    sessions: ReadonlyMap<string, ClassSession>;
    onOpen(selected: typeof course): void;
    onConnected(selected: typeof course): void;
    onExploreDemo(): void;
  }) => (
    <section>
      <h1 tabIndex={-1} data-page-title>
        Today
      </h1>
      <p>{day}</p>
      <p data-testid="today-loaded-count">
        {sessions.get(course.shareId)?.days.get(day)?.reports.length ?? 'Not loaded'}
      </p>
      <button onClick={() => onOpen(course)}>Open class</button>
      <button onClick={onExploreDemo}>Explore a demo class</button>
      {connectRequest > 0 && <button onClick={() => onConnected(course)}>Finish connecting</button>}
    </section>
  ),
}));
vi.mock('./TeacherClassReports', () => ({
  DemoClassPage: ({ onExit }: { onExit(): void }) => (
    <section>
      <h1 tabIndex={-1} data-page-title>
        Biology — fictional demo
      </h1>
      <button onClick={onExit}>Exit demo</button>
    </section>
  ),
  ClassPage: ({
    session,
    request,
    onUnlocked,
    beginUnlock,
    onLock,
  }: {
    session: ClassSession | null;
    request: ClassRequest | null;
    onUnlocked(session: ClassSession): void;
    beginUnlock(): (session: ClassSession) => boolean;
    onLock(): void;
  }) => (
    <section>
      <h1 tabIndex={-1} data-page-title>
        Biology
      </h1>
      <p>{session ? 'Unlocked' : request ? `Asking to ${request.kind}` : 'Locked'}</p>
      <button
        onClick={() => {
          const session = {
            connection: { shareId: course.shareId },
            days: new Map(loadedDays),
          } as unknown as ClassSession;
          if (beginUnlock()(session)) onUnlocked(session);
        }}
      >
        Pretend unlock
      </button>
      <button onClick={onLock}>Lock</button>
    </section>
  ),
}));
vi.mock('./TeacherKeySetup', () => ({
  TeacherKeySetup: ({
    initialCourse,
    initialMode,
  }: {
    initialCourse?: string;
    initialMode?: string;
  }) => (
    <p>
      {initialMode} {initialCourse ?? 'any class'}
    </p>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  loadedDays.clear();
  store.list.mockResolvedValue([course]);
});

function show() {
  render(
    <ThemeProvider>
      <StandaloneTeacherHome />
    </ThemeProvider>,
  );
}

it('opens and exits a demo without adding it to classes or loaded sessions', async () => {
  store.list.mockResolvedValue([]);
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Explore a demo class' }));
  const title = await screen.findByRole('heading', { name: 'Biology — fictional demo' });
  await waitFor(() => expect(title).toHaveFocus());
  const nav = screen.getAllByRole('navigation', { name: 'Classes' })[0];
  expect(within(nav).queryByRole('button', { name: /Biology/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Exit demo' }));
  const today = await screen.findByRole('heading', { name: 'Today' });
  await waitFor(() => expect(today).toHaveFocus());
  expect(screen.getByTestId('today-loaded-count')).toHaveTextContent('Not loaded');
  expect(store.list).toHaveBeenCalledOnce();
});

it('asks to unlock a locked class on open, leaving focus for its passphrase', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Open class' }));
  const heading = await screen.findByRole('heading', { name: 'Biology' });
  expect(screen.getByText('Asking to unlock')).toBeVisible();
  expect(heading).not.toHaveFocus();
  const nav = screen.getAllByRole('navigation', { name: 'Classes' })[0];
  expect(within(nav).getByRole('button', { name: 'Biology' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

it('keeps an unlocked class open across pages until it is locked', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Open class' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Pretend unlock' }));
  expect(screen.getByText('Unlocked')).toBeVisible();
  const nav = screen.getAllByRole('navigation', { name: 'Classes' })[0];
  fireEvent.click(within(nav).getByRole('button', { name: 'Today' }));
  // A plain page change moves focus to the new title, as a route change would.
  const today = await screen.findByRole('heading', { name: 'Today' });
  await waitFor(() => expect(today).toHaveFocus());
  fireEvent.click(within(nav).getByRole('button', { name: 'Biology' }));
  expect(await screen.findByText('Unlocked')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
  expect(screen.getByText('Locked')).toBeVisible();
});

it('carries a new connection from the sidebar to protecting its class', async () => {
  show();
  const nav = (await screen.findAllByRole('navigation', { name: 'Classes' }))[0];
  fireEvent.click(within(nav).getByRole('button', { name: 'Connect a class' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Finish connecting' }));
  expect(await screen.findByText('Asking to setup')).toBeVisible();
  expect(store.list).toHaveBeenCalledTimes(2);
  // Once unlocked, the set-up request is spent: locking shows the plain card.
  fireEvent.click(screen.getByRole('button', { name: 'Pretend unlock' }));
  fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
  expect(screen.getByText('Locked')).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('uses today’s loaded day consistently for Today and sidebar summaries', async () => {
  const today = isoDayLabel(Date.now());
  const yesterday = isoDayLabel(isoDayStartMs(today) - DAY_MS);
  const report = {
    v: 1 as const,
    shareId: course.shareId,
    day: today,
    pupil: { id: '1'.repeat(32), label: 'Ada' },
    events: [],
    omitted: 0,
  };
  loadedDays.set(today, { unreadable: 0, reports: [{ slotId: 'today', report }] });
  loadedDays.set(yesterday, {
    unreadable: 0,
    reports: [
      { slotId: 'old-1', report: { ...report, day: yesterday } },
      { slotId: 'old-2', report: { ...report, day: yesterday } },
    ],
  });
  show();
  expect(await screen.findByText(today)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Open class' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Pretend unlock' }));
  const nav = screen.getAllByRole('navigation', { name: 'Classes' })[0];
  expect(within(within(nav).getByRole('button', { name: 'Biology' })).getByText('1')).toBeVisible();
  expect(within(nav).queryByText('2')).not.toBeInTheDocument();
  fireEvent.click(within(nav).getByRole('button', { name: 'Today' }));
  expect(await screen.findByTestId('today-loaded-count')).toHaveTextContent('1');
  expect(screen.getByText(today)).toBeVisible();
});

it('opens recovery and the explanation of Gaps as pages from the sidebar', async () => {
  show();
  const more = (await screen.findAllByRole('navigation', { name: 'More' }))[0];
  fireEvent.click(within(more).getByRole('button', { name: 'Recover a class' }));
  const title = await screen.findByRole('heading', { name: 'Recover a class' });
  expect(await screen.findByText('restore any class')).toBeInTheDocument();
  await waitFor(() => expect(title).toHaveFocus());
  expect(within(more).getByRole('button', { name: 'Recover a class' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  fireEvent.click(within(more).getByRole('button', { name: 'About Gaps' }));
  await screen.findByRole('heading', { name: 'About Gaps' });
  expect(screen.getByText(/no report does not mean no study/)).toBeInTheDocument();
  expect(
    screen.getByText(/Send latest progress shares today’s partial UTC results/),
  ).toHaveTextContent(/Send latest progress/);
  expect(screen.getByText(/Automatic reports cover yesterday \(UTC\)/)).toBeVisible();
  expect(screen.getByRole('link', { name: 'School data notice' })).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('focuses and traps mobile navigation while the background is inert', async () => {
  const matchMedia = window.matchMedia.bind(window);
  const media = vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
    query === '(min-width: 768px)'
      ? {
          ...matchMedia(query),
          matches: false,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }
      : matchMedia(query),
  );
  show();
  await screen.findByRole('button', { name: 'Open class' });
  const trigger = screen.getByRole('button', { name: 'Open navigation' });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Navigation' });
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  expect(trigger.closest('[inert]')).not.toBeNull();
  const buttons = within(dialog).getAllByRole('button');
  const last = buttons[buttons.length - 1];
  last.focus();
  fireEvent.keyDown(last, { key: 'Tab' });
  expect(buttons[0]).toHaveFocus();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
  expect(trigger.closest('[inert]')).toBeNull();
  media.mockRestore();
});
