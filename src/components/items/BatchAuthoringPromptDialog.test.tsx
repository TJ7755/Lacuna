import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BatchAuthoringPromptDialog } from './BatchAuthoringPromptDialog';
import { BATCH_OUTPUT_START, MAX_BATCH_ITEMS } from '../../items/prompts';

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
  it('copies a capped, course-scoped prompt from the form', async () => {
    render(<BatchAuthoringPromptDialog courseName="A-Level Economics" onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Paste the notes for one lesson or topic…'), {
      target: { value: 'Demand falls as price rises.' },
    });
    fireEvent.change(screen.getByPlaceholderText('Demand'), { target: { value: 'Demand' } });
    fireEvent.change(screen.getByPlaceholderText('A level'), { target: { value: 'A level' } });
    fireEvent.change(screen.getByLabelText('Items this round'), { target: { value: '99' } });
    fireEvent.change(screen.getByLabelText('Round'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy batch prompt' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const prompt = writeText.mock.calls[0][0] as string;
    expect(prompt).toContain('Demand falls as price rises.');
    expect(prompt).toContain(`Requested items: ${MAX_BATCH_ITEMS}`);
    expect(prompt).toContain('continuation round 2');
    expect(prompt).toContain(BATCH_OUTPUT_START);
    expect(notify).toHaveBeenCalledWith('Batch prompt copied to the clipboard.', 'positive');
  });

  it('requires notes, topic and level before copying', () => {
    render(<BatchAuthoringPromptDialog courseName="Economics" onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Copy batch prompt' })).toBeDisabled();
  });
});
