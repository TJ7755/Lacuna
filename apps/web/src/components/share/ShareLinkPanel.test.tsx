import { act, fireEvent, render, screen } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Course } from '@lacuna/core/db/types';
import { ShareLinkPanel } from './ShareLinkPanel';

const { publish, credentials } = vi.hoisted(() => ({ publish: vi.fn(), credentials: vi.fn() }));
vi.mock('../../shareLinks/publish', () => ({
  publishShareLink: publish,
  unpublishShareLink: vi.fn(),
  ShareLinkNeedsReplacementError: class extends Error {},
}));
vi.mock('../../shareLinks/credentials', () => ({ readShareCredentials: credentials }));
vi.mock('../ui/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 1,
}));

// Happy DOM rejects cancelled native-animation promises; exercise Motion's real JS fallback.
const animateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
beforeAll(() => Reflect.deleteProperty(Element.prototype, 'animate'));
afterAll(() => {
  if (animateDescriptor) Object.defineProperty(Element.prototype, 'animate', animateDescriptor);
});
beforeEach(() => {
  publish.mockReset();
  credentials.mockReset();
});
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 450)));
const course = { id: 'biology', name: 'Biology' } as Course;
const view = (value: Course) => (
  <LazyMotion features={domAnimation}>
    <ShareLinkPanel course={value} highlight={false} />
  </LazyMotion>
);

describe('ShareLinkPanel exit', () => {
  it('retires the creation action immediately when the live link replaces it', async () => {
    publish.mockResolvedValue({ shareId: 'a'.repeat(32), revision: 1 });
    render(view(course));
    const outgoing = screen.getByRole('button', { name: 'Create share link' });
    outgoing.focus();
    await act(async () => fireEvent.click(outgoing));
    expect(outgoing).toBeInTheDocument();
    expect(outgoing.closest('[inert]')).not.toBeNull();
    expect(outgoing.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(
      screen.queryByRole('button', { name: /Create share link|Creating/ }),
    ).not.toBeInTheDocument();
    await settle();
    const incoming = screen.getByRole('textbox', { name: 'Share link' });
    expect(incoming.closest('[inert]')).toBeNull();
    expect(incoming).toHaveFocus();
  });

  it('waits for credentials before showing link controls or the replacement warning', async () => {
    let finishCredentials!: (value: null) => void;
    credentials.mockReturnValue(
      new Promise<null>((resolve) => {
        finishCredentials = resolve;
      }),
    );
    render(
      view({
        ...course,
        distribution: {
          shareId: 'b'.repeat(32),
          shareRevision: 1,
          revision: 1,
          publishedAt: Date.now(),
        },
      } as Course),
    );
    expect(screen.getByRole('region', { name: 'Share link' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update link' })).not.toBeInTheDocument();
    await act(async () => finishCredentials(null));
    expect(screen.queryByRole('button', { name: 'Update link' })).not.toBeInTheDocument();
    await settle();
    expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveValue(
      `${window.location.origin}/#/s/${'b'.repeat(32)}`,
    );
    expect(publish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Link management'));
    expect(screen.getByRole('button', { name: 'Replace link' }).closest('[inert]')).toBeNull();
  });
});

it('forwards an imported course link without publishing a new lineage', async () => {
  const shareId = 'c'.repeat(32);
  localStorage.setItem('lacuna.shareImports', JSON.stringify({ [shareId]: course.id }));
  render(view({ ...course, distributedCopy: { lineageId: 'publisher', revision: 7 } } as Course));
  expect(await screen.findByRole('textbox', { name: 'Share link' })).toHaveValue(
    `${window.location.origin}/#/s/${shareId}`,
  );
  expect(screen.queryByRole('button', { name: 'Create share link' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Update link' })).not.toBeInTheDocument();
  expect(screen.getByText(/publisher’s updates/)).toBeVisible();
  expect(screen.getByRole('link', { name: 'Set up a class in Gaps' })).toHaveAttribute(
    'href',
    `https://gaps.getlacuna.app/#course=${shareId}`,
  );
  expect(publish).not.toHaveBeenCalled();
  localStorage.removeItem('lacuna.shareImports');
});

it('offers class set-up for a published course with only its public share id', async () => {
  const shareId = 'd'.repeat(32);
  credentials.mockResolvedValue({ token: 'private-token' });
  render(view({ ...course, distribution: { shareId, revision: 1, publishedAt: 0 } } as Course));
  const link = await screen.findByRole('link', { name: 'Set up a class in Gaps' });
  expect(link).toHaveAttribute('href', `https://gaps.getlacuna.app/#course=${shareId}`);
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

it('does not offer class set-up without a share link', () => {
  render(view(course));
  expect(screen.queryByRole('link', { name: 'Set up a class in Gaps' })).not.toBeInTheDocument();
});
