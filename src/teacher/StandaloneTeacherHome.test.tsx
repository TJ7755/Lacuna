import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  StandaloneTeacherHome,
  type ClassRequest,
  type ClassSession,
} from './StandaloneTeacherHome';
import { ThemeProvider } from '../state/ThemeContext';

const course = { shareId: 'a'.repeat(32), courseName: 'Biology', verifiedAt: 0 };
const { store } = vi.hoisted(() => ({ store: { list: vi.fn(), close: vi.fn() } }));
vi.mock('./connectionStore', () => ({ createGapsConnectionStore: () => store }));
vi.mock('./TeacherCourses', () => ({
  TodayPage: ({
    connectRequest,
    onOpen,
    onConnected,
  }: {
    connectRequest: number;
    onOpen(selected: typeof course): void;
    onConnected(selected: typeof course): void;
  }) => (
    <section>
      <h1 tabIndex={-1} data-page-title>
        Today
      </h1>
      <button onClick={() => onOpen(course)}>Open class</button>
      {connectRequest > 0 && <button onClick={() => onConnected(course)}>Finish connecting</button>}
    </section>
  ),
}));
vi.mock('./TeacherClassReports', () => ({
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
            days: new Map(),
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
  store.list.mockResolvedValue([course]);
});

function show() {
  render(
    <ThemeProvider>
      <StandaloneTeacherHome />
    </ThemeProvider>,
  );
}

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
  expect(screen.getByRole('link', { name: 'School data notice' })).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
