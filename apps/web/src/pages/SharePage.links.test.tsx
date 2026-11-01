import './SharePage.testSupport';
import {
  chooseCourse,
  expectShareLinkRevision,
  given,
  linked,
  mockCourse,
  mockNotify,
  mockPublishShareLink,
  mockReadShareCredentials,
  mockUnpublishShareLink,
  render,
  sharePageState,
} from './SharePage.testSupport';
import { describe, expect, it } from 'vitest';
import { StrictMode } from 'react';
import { act, screen, fireEvent, waitFor } from '@testing-library/react';
import { SharePage } from './SharePage';
import { ShareLinkNeedsReplacementError } from '../shareLinks/publish';
import type { Course } from '../db/types';

describe('SharePage links', () => {
  it('creates links after StrictMode replays the mount effect', async () => {
    given(mockCourse);
    mockPublishShareLink.mockResolvedValue({ shareId: 'a'.repeat(32), revision: 1 });
    render(
      <StrictMode>
        <SharePage />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create share link' }));
    expect(await screen.findByRole('textbox', { name: 'Share link' })).toBeInTheDocument();
  });

  it('moves keyboard focus to the link after creating it', async () => {
    given(mockCourse);
    mockPublishShareLink.mockResolvedValue({ shareId: 'a'.repeat(32), revision: 1 });
    render(<SharePage />);
    const create = screen.getByRole('button', { name: 'Create share link' });
    create.focus();
    fireEvent.click(create);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveFocus());
  });

  it('opens Gaps for the selected shared course without requiring local credentials', async () => {
    const shareId = 'a'.repeat(32);
    const other = { ...mockCourse, id: 'other', name: 'Other course' };
    given(other, linked(shareId, 1));
    mockReadShareCredentials.mockResolvedValue(null);
    render(<SharePage />);
    const link = screen.getByRole('link', { name: 'Class insights' });
    expect(link).toHaveAttribute('href', `https://gaps.getlacuna.app/#course=${shareId}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await screen.findByText(/Copy and pass on this link/);

    chooseCourse('Other course');
    expect(link).toHaveAttribute('href', 'https://gaps.getlacuna.app');
    chooseCourse('Test Course');
    expect(link).toHaveAttribute('href', `https://gaps.getlacuna.app/#course=${shareId}`);
  });

  it('prefills Class insights with an imported course share link', () => {
    const shareId = 'c'.repeat(32);
    localStorage.setItem('lacuna.shareImports', JSON.stringify({ [shareId]: mockCourse.id }));
    try {
      given({
        ...mockCourse,
        distributedCopy: { lineageId: 'publisher', revision: 7 },
      } as Course);
      render(<SharePage />);
      expect(screen.getByRole('link', { name: 'Class insights' })).toHaveAttribute(
        'href',
        `https://gaps.getlacuna.app/#course=${shareId}`,
      );
      expect(screen.getByRole('link', { name: 'Set up a class in Gaps' })).toHaveAttribute(
        'href',
        `https://gaps.getlacuna.app/#course=${shareId}`,
      );
      expect(screen.getByText(/^Revision 7/)).toBeVisible();
    } finally {
      localStorage.removeItem('lacuna.shareImports');
    }
  });

  it.each(['unshared', 'loading', 'empty'])('links to Gaps with %s courses', (state) => {
    if (state === 'unshared') given(mockCourse);
    if (state === 'empty') given();
    render(<SharePage />);
    const link = screen.getByRole('link', { name: 'Class insights' });
    expect(link).toHaveAttribute('href', 'https://gaps.getlacuna.app');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('clears the previous link and ignores its credentials when switching courses', async () => {
    const shared = linked('c'.repeat(32), 3);
    const other = { ...mockCourse, id: 'course-2', name: 'Other Course' };
    let resolveCredentials!: (value: null) => void;
    mockReadShareCredentials.mockReturnValueOnce(
      new Promise((resolve) => (resolveCredentials = resolve)),
    );
    given(shared, other);
    render(<SharePage />);
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();

    chooseCourse('Other Course');
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create share link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Course to share' })).toHaveFocus();
    await act(async () => resolveCredentials(null));
    expect(screen.queryByRole('button', { name: 'Replace link' })).not.toBeInTheDocument();
    expect(mockPublishShareLink).not.toHaveBeenCalled();
  });

  it('rings link creation from the announcement without publishing', () => {
    given(mockCourse);
    sharePageState.mockSearchParams = new URLSearchParams('highlight=share-link');
    render(<SharePage />);
    expect(screen.getByRole('button', { name: 'Create share link' })).toHaveClass(
      'ring-2',
      'ring-accent',
    );
    expect(mockPublishShareLink).not.toHaveBeenCalled();
  });

  it('does not ring link creation on an ordinary visit', () => {
    given(mockCourse);
    render(<SharePage />);
    expect(screen.getByRole('button', { name: 'Create share link' })).not.toHaveClass(
      'ring-accent',
    );
  });

  it.each([false, true])('creates a share link for the course (desktop: %s)', async (desktop) => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { isElectron: desktop },
    });
    const shareId = 'a'.repeat(32);
    given(mockCourse);
    mockPublishShareLink.mockResolvedValue({ shareId, revision: 1, byteSize: 128 });
    render(<SharePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Create share link' }));
    await expectShareLinkRevision(1);
    expect(await screen.findByRole('textbox', { name: 'Share link' })).toHaveValue(
      `${desktop ? 'https://getlacuna.app' : window.location.origin}/#/s/${shareId}`,
    );
    expect(mockPublishShareLink).toHaveBeenCalledWith(mockCourse.id);
    expect(screen.getByText(/^Revision 1/)).toBeInTheDocument();
    expect(screen.getByTestId('qr-code')).toBeInTheDocument();
    expect(mockNotify).toHaveBeenCalledWith('Share link ready.', 'positive');
  });

  it('shows a live link for a course that already has one, without publishing', async () => {
    const shareId = 'c'.repeat(32);
    given(linked(shareId, 3));
    render(<SharePage />);
    await expectShareLinkRevision(3);
    expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveValue(
      `${window.location.origin}/#/s/${shareId}`,
    );
    expect(screen.getByText(/^Revision 3 · updated/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update link' })).toBeInTheDocument();
    expect(mockPublishShareLink).not.toHaveBeenCalled();
    await waitFor(() => expect(mockReadShareCredentials).toHaveBeenCalledWith(shareId));
  });

  it('updates a live link in place', async () => {
    const shareId = 'c'.repeat(32);
    given(linked(shareId, 1));
    mockPublishShareLink.mockResolvedValue({ shareId, revision: 2, byteSize: 128 });
    render(<SharePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Update link' }));
    await expectShareLinkRevision(2);
    expect(mockNotify).toHaveBeenCalledWith('Link updated to revision 2.', 'positive');
  });

  it('stops sharing after inline confirmation', async () => {
    given(linked('d'.repeat(32), 2));
    mockUnpublishShareLink.mockResolvedValue(undefined);
    render(<SharePage />);
    await expectShareLinkRevision(2);
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop sharing' }));
    await waitFor(() => expect(mockUnpublishShareLink).toHaveBeenCalledWith(mockCourse.id));
    expect(await screen.findByRole('button', { name: 'Create share link' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
    expect(mockNotify).toHaveBeenCalledWith(
      'Share link removed. Students keep their copies but will not receive updates.',
      'positive',
    );
  });

  it('notifies when share link creation fails', async () => {
    given(mockCourse);
    mockPublishShareLink.mockRejectedValue(new Error('Too large.'));
    render(<SharePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Create share link' }));
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith('Too large.', 'negative'));
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
  });

  it('allows forwarding an other-device link and keeps replacement under management', async () => {
    given(linked('e'.repeat(32), 2));
    mockReadShareCredentials.mockResolvedValue(null);
    const replacementId = 'f'.repeat(32);
    mockPublishShareLink.mockResolvedValue({ shareId: replacementId, revision: 2, byteSize: 128 });
    render(<SharePage />);
    await screen.findByText(/Copy and pass on this link/);
    expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveValue(
      `${window.location.origin}/#/s/${'e'.repeat(32)}`,
    );
    expect(mockPublishShareLink).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Link management'));
    fireEvent.click(screen.getByRole('button', { name: 'Replace link' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, replace it' }));
    await waitFor(() =>
      expect(mockPublishShareLink).toHaveBeenCalledWith(mockCourse.id, { replaceLink: true }),
    );
    await expectShareLinkRevision(2);
    expect(await screen.findByRole('textbox', { name: 'Share link' })).toHaveValue(
      `${window.location.origin}/#/s/${replacementId}`,
    );
  });

  it('keeps the link available for forwarding when ownership verification fails', async () => {
    given(linked('b'.repeat(32), 2));
    mockPublishShareLink.mockRejectedValue(
      new ShareLinkNeedsReplacementError('This link was created on another device.'),
    );
    render(<SharePage />);
    await expectShareLinkRevision(2);
    fireEvent.click(screen.getByRole('button', { name: 'Update link' }));
    await screen.findByText(/Copy and pass on this link/);
    expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveValue(
      `${window.location.origin}/#/s/${'b'.repeat(32)}`,
    );
    expect(screen.queryByRole('button', { name: 'Update link' })).not.toBeInTheDocument();
    expect(mockNotify).toHaveBeenCalledWith('This link was created on another device.', 'negative');
  });

  it('ignores a link that finishes after switching course', async () => {
    const courseA = { ...mockCourse, id: 'course-a', name: 'Course A' };
    const courseB = { ...mockCourse, id: 'course-b', name: 'Course B' };
    given(courseA, courseB);
    let resolvePublish!: (value: { shareId: string; revision: number; byteSize: number }) => void;
    mockPublishShareLink.mockReturnValueOnce(new Promise((resolve) => (resolvePublish = resolve)));
    render(<SharePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Create share link' }));
    chooseCourse('Course B');
    await act(async () => resolvePublish({ shareId: 'a'.repeat(32), revision: 1, byteSize: 128 }));
    expect(mockPublishShareLink).toHaveBeenCalledWith(courseA.id);
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
  });

  it('makes sending a newer revision the primary action when the link is behind', async () => {
    given(linked('c'.repeat(32), 5, { shareRevision: 3 }));
    render(<SharePage />);
    await expectShareLinkRevision(3);
    expect(screen.getByText(/^Revision 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send revision 5' })).toBeInTheDocument();
  });
});
