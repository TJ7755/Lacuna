import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuestionSetLibraryActions } from './QuestionSetLibraryActions';

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
}));

vi.mock('../../questions/questionSetRepository', () => ({
  removeAuthoredQuestionSet: (...args: unknown[]) => mocks.remove(...args),
}));

function renderActions(onRemoved = vi.fn()) {
  return {
    onRemoved,
    ...render(
      <MemoryRouter>
        <QuestionSetLibraryActions
          courseId="course-1"
          setId="set-1"
          title="Cell structure"
          contentRevisionId="content-revision-4"
          draftRevisionId="draft-revision-7"
          onRemoved={onRemoved}
        />
      </MemoryRouter>,
    ),
  };
}

beforeEach(() => {
  mocks.remove.mockReset();
});

describe('QuestionSetLibraryActions', () => {
  it('cancels removal without calling the repository', () => {
    renderActions();
    expect(screen.getByText('More').closest('summary')).toHaveAttribute(
      'aria-label',
      'Options for Cell structure',
    );
    fireEvent.click(screen.getByText('More'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove set' }));

    expect(screen.getByText('Remove this set? Saved attempts will remain.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mocks.remove).not.toHaveBeenCalled();
    expect(screen.queryByText('Remove this set? Saved attempts will remain.')).toBeNull();
  });

  it('passes the current revisions and ignores duplicate confirms while removal is pending', async () => {
    let finish!: () => void;
    mocks.remove.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    const { onRemoved } = renderActions();
    fireEvent.click(screen.getByText('More'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove set' }));
    const confirm = screen.getByRole('button', { name: 'Remove set' });
    fireEvent.click(confirm);

    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith('course-1', 'set-1', {
      expectedContentRevisionId: 'content-revision-4',
      expectedDraftRevisionId: 'draft-revision-7',
    });
    expect(screen.getByRole('status')).toHaveTextContent('Removing…');
    fireEvent.click(confirm);
    expect(mocks.remove).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    await waitFor(() => expect(onRemoved).toHaveBeenCalledTimes(1));
  });

  it('keeps confirmation available after a removal error and allows retry', async () => {
    mocks.remove.mockRejectedValueOnce(new Error('The set changed in another tab.'));
    mocks.remove.mockResolvedValueOnce(undefined);
    const { onRemoved } = renderActions();
    fireEvent.click(screen.getByText('More'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove set' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove set' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The set changed in another tab.');
    expect(screen.getByText('Remove this set? Saved attempts will remain.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove set' }));

    await waitFor(() => expect(onRemoved).toHaveBeenCalledTimes(1));
    expect(mocks.remove).toHaveBeenCalledTimes(2);
  });
});
