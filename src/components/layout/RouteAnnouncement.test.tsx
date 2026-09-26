import { render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import RouteAnnouncement from './RouteAnnouncement';

it('announces the shared-course page for share links', async () => {
  render(<RouteAnnouncement pathname="/s/aaaabbbbccccddddeeeeffffgggghhhh" />);
  await waitFor(() => expect(document.title).toBe('Shared course · Lacuna'));
  expect(await screen.findByRole('status')).toHaveTextContent('Shared course');
});

it('keeps announcing known pages', async () => {
  const { unmount } = render(<RouteAnnouncement pathname="/share" />);
  await waitFor(() => expect(document.title).toBe('Share · Lacuna'));
  unmount();
});
