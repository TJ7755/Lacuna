import { act, fireEvent, render, screen } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Course } from '../../db/types';
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

  it('retires live link controls while their replacement warning enters', async () => {
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
    const outgoing = screen.getByRole('textbox', { name: 'Share link' });
    await act(async () => finishCredentials(null));
    expect(outgoing).toBeInTheDocument();
    expect(outgoing.closest('[inert]')).not.toBeNull();
    expect(outgoing.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update link' })).not.toBeInTheDocument();
    await settle();
    expect(screen.getByRole('button', { name: 'Replace link' }).closest('[inert]')).toBeNull();
  });
});
