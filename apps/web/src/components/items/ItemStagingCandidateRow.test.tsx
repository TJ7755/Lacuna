import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BatchCandidate } from '../../items/batchStaging';
import { ItemStagingCandidateRow, type StagingDecision } from './ItemStagingCandidateRow';

const notify = vi.fn();
const writeText = vi.fn();

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ notify }),
}));

function candidate(overrides: Partial<BatchCandidate> = {}): BatchCandidate {
  return {
    id: 'candidate-1',
    index: 2,
    raw: { question: 'What is x?', scheme: 'M1 for x = 2', fixtures: [{ id: 'f-1' }] },
    sourceJson: '{"question":"What is x?"}',
    kind: 'working',
    question: 'What is x?',
    explanation: '',
    targetConcept: 'Linear equations',
    prerequisiteConcepts: ['Inverse operations'],
    errors: [],
    payload: { kind: 'working' } as BatchCandidate['payload'],
    fixtureStatus: { total: 3, passed: 2 },
    ...overrides,
  };
}

function renderRow(
  value: BatchCandidate,
  props: { decision?: StagingDecision; editing?: boolean; duplicate?: boolean } = {},
) {
  const handlers = {
    onBeginEdit: vi.fn(),
    onCancelEdit: vi.fn(),
    onApplyEdit: vi.fn(),
    onAccept: vi.fn(),
    onReject: vi.fn(),
    onRestore: vi.fn(),
  };
  const view = render(
    <ItemStagingCandidateRow
      candidate={value}
      decision={props.decision ?? 'staged'}
      duplicate={props.duplicate ?? false}
      editing={props.editing ?? false}
      importing={false}
      motionMultiplier={0}
      {...handlers}
    />,
  );
  return { ...handlers, ...view };
}

describe('ItemStagingCandidateRow', () => {
  beforeEach(() => {
    notify.mockReset();
    writeText.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('summarises a valid working item and routes its actions', () => {
    const { onBeginEdit, onReject, onAccept } = renderRow(candidate());
    expect(screen.getByText('Question 3')).toBeInTheDocument();
    expect(screen.getByText('Valid')).toBeInTheDocument();
    expect(screen.getByText('2 of 3 fixtures pass')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Primary skill practised: Linear equations · Prerequisites: Inverse operations',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onBeginEdit).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('blocks acceptance and lists errors when validation fails', () => {
    renderRow(
      candidate({
        payload: undefined,
        kind: null,
        question: '',
        targetConcept: '',
        errors: ['Fixture 1 expected 2 marks but got 1'],
        fixtureStatus: null,
      }),
      { duplicate: true },
    );
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('Untitled Question')).toBeInTheDocument();
    expect(screen.getByText('Unknown item kind')).toBeInTheDocument();
    expect(screen.getByText('Likely duplicate')).toBeInTheDocument();
    expect(screen.getByText('Fixture 1 expected 2 marks but got 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();
  });

  it('moves focus into the editor and back to Edit when editing ends', () => {
    const view = renderRow(candidate());
    const props = {
      candidate: candidate(),
      decision: 'staged' as const,
      duplicate: false,
      importing: false,
      motionMultiplier: 0,
      onBeginEdit: view.onBeginEdit,
      onCancelEdit: view.onCancelEdit,
      onApplyEdit: view.onApplyEdit,
      onAccept: view.onAccept,
      onReject: view.onReject,
      onRestore: view.onRestore,
    };
    view.rerender(<ItemStagingCandidateRow {...props} editing />);
    expect(screen.getByRole('textbox', { name: 'Question' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(view.onCancelEdit).toHaveBeenCalledTimes(1);
    view.rerender(<ItemStagingCandidateRow {...props} editing={false} />);
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();
  });

  it('offers only Restore once rejected', () => {
    const { onRestore } = renderRow(candidate(), { decision: 'rejected' });
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid pasted revision without applying it', () => {
    const { onApplyEdit } = renderRow(candidate());
    fireEvent.click(screen.getByRole('button', { name: 'Revise with AI' }));
    expect(screen.getByRole('textbox', { name: 'What should change?' })).toHaveFocus();
    fireEvent.change(screen.getByRole('textbox', { name: 'Revised reply' }), {
      target: { value: '{not json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply revision' }));
    expect(onApplyEdit).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining('The revised JSON is invalid'),
      'negative',
    );
  });

  it('applies the first item of a valid revision and closes the panel', () => {
    const { onApplyEdit } = renderRow(candidate());
    fireEvent.click(screen.getByRole('button', { name: 'Revise with AI' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Revised reply' }), {
      target: { value: '[{"question":"Revised"},{"question":"Padding"}]' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply revision' }));
    expect(onApplyEdit).toHaveBeenCalledWith(JSON.stringify({ question: 'Revised' }, null, 2));
    expect(notify).toHaveBeenCalledWith('Revised item applied.', 'positive');
  });

  it('copies a prompt carrying the failing fixture, and reports a clipboard failure', async () => {
    writeText.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
    renderRow(candidate({ errors: ['Fixture 1 awarded 0 of 2 marks'] }));

    fireEvent.click(screen.getByRole('button', { name: 'Revise with AI' }));
    const copy = screen.getByRole('button', { name: 'Copy revision prompt' });
    expect(copy).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'What should change?' }), {
      target: { value: 'Marks are too harsh' },
    });
    fireEvent.click(copy);
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('Revision prompt copied to the clipboard.', 'positive'),
    );
    const prompt = writeText.mock.calls[0][0] as string;
    expect(prompt).toContain('Marks are too harsh');
    expect(prompt).toContain('"id": "f-1"');

    fireEvent.click(screen.getByRole('button', { name: 'Revise with AI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy revision prompt' }));
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('Could not copy the revision prompt.', 'negative'),
    );
  });
});
