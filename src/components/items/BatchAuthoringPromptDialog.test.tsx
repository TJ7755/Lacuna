import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BatchAuthoringPromptDialog } from './BatchAuthoringPromptDialog';
import { BATCH_OUTPUT_START } from '../../items/prompts';

const notify = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ notify }),
}));

beforeEach(() => {
  notify.mockClear();
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
});

describe('BatchAuthoringPromptDialog', () => {
  it('does not dismiss when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(
      <BatchAuthoringPromptDialog
        courseId="course-1"
        courseName="Economics"
        lessons={[]}
        questions={[]}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId('batch-authoring-backdrop'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('warns before discarding an entered batch prompt', () => {
    const onClose = vi.fn();
    render(
      <BatchAuthoringPromptDialog
        courseId="course-1"
        courseName="Economics"
        lessons={[]}
        questions={[]}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Paste the notes for one lesson or topic…'), {
      target: { value: 'Unsaved notes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByText('Discard this unsaved Question batch prompt and staging review?'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard batch' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('switches from prompt building to the staging review', () => {
    render(
      <BatchAuthoringPromptDialog
        courseId="course-1"
        courseName="Economics"
        lessons={[]}
        questions={[]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Review response' }));
    expect(screen.getByText('Generated Question batch')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Target lesson' })).toBeDisabled();
    expect(screen.getByPlaceholderText(new RegExp(BATCH_OUTPUT_START))).toHaveFocus();
  });

  it('moves focus safely into the unsaved-close warning', () => {
    render(
      <BatchAuthoringPromptDialog
        courseId="course-1"
        courseName="Economics"
        lessons={[]}
        questions={[]}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('Paste the notes for one lesson or topic…'), {
      target: { value: 'Unsaved notes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    const warning = screen.getByText(
      'Discard this unsaved Question batch prompt and staging review?',
    ).parentElement!;
    expect(within(warning).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('copies a constrained, course-scoped prompt from the form', async () => {
    render(
      <BatchAuthoringPromptDialog
        courseId="course-1"
        courseName="A-Level Economics"
        examBoard="AQA"
        specification="7136"
        lessons={[]}
        questions={[]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Paste the notes for one lesson or topic…'), {
      target: { value: 'Demand falls as price rises.' },
    });
    fireEvent.change(screen.getByPlaceholderText('Demand'), { target: { value: 'Demand' } });
    fireEvent.change(screen.getByPlaceholderText('A level'), { target: { value: 'A level' } });
    fireEvent.click(screen.getByLabelText('Set generation constraints'));
    fireEvent.change(screen.getByLabelText(/Maximum items/), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy Question batch prompt' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const prompt = writeText.mock.calls[0][0] as string;
    expect(prompt).toContain('Demand falls as price rises.');
    expect(prompt).toContain('Exam board: AQA');
    expect(prompt).toContain('Specification: 7136');
    expect(prompt).toContain('Requested maximum items: 99');
    expect(prompt).toContain('exactly one primary target Concept');
    expect(prompt).toContain('List any prerequisite Concepts separately');
    expect(prompt).toContain(BATCH_OUTPUT_START);
    expect(notify).toHaveBeenCalledWith(
      'Question batch prompt copied to the clipboard.',
      'positive',
    );
  });

  it('requires notes, topic and level before copying', () => {
    render(
      <BatchAuthoringPromptDialog
        courseId="course-1"
        courseName="Economics"
        lessons={[]}
        questions={[]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Concept checks, not worksheets')).toBeInTheDocument();
    expect(
      screen.getByText(/arbitrary-number exercise variants are not supported yet/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Question batch prompt' })).toBeDisabled();
  });

  it('lets the model choose the batch size while preserving the one-target invariant', async () => {
    render(
      <BatchAuthoringPromptDialog
        courseId="course-1"
        courseName="Economics"
        lessons={[]}
        questions={[]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Paste the notes for one lesson or topic…'), {
      target: { value: 'Dense lesson notes.' },
    });
    fireEvent.change(screen.getByPlaceholderText('Demand'), { target: { value: 'Demand' } });
    fireEvent.change(screen.getByPlaceholderText('A level'), { target: { value: 'A level' } });
    expect(screen.getByLabelText('Set generation constraints')).not.toBeChecked();
    expect(screen.queryByLabelText(/Maximum items/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy Question batch prompt' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain('exactly one primary target Concept');
    expect(writeText.mock.calls[0][0]).toContain('Requested maximum items: model-selected');
  });
});
