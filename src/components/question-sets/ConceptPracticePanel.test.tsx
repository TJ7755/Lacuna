import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ConceptPracticeModule from '../../questions/conceptPractice';
import { emptyQuestionSchedule } from '../../questions/scheduler';
import { ConceptPracticePanel } from './ConceptPracticePanel';
import {
  ConceptPracticeExhaustedError,
  startConceptPractice,
} from '../../questions/conceptPractice';

vi.mock('../../questions/conceptPractice', async (importOriginal) => {
  const actual = await importOriginal<typeof ConceptPracticeModule>();
  return { ...actual, startConceptPractice: vi.fn(), undoConceptPracticeAttempt: vi.fn() };
});

const skill = {
  conceptId: 'density',
  name: 'Density',
  schedule: emptyQuestionSchedule(),
  due: true,
  unseenCount: 0,
  familiarCount: 1,
  availableCount: 1,
};

function view(skills = [skill], disabled = false) {
  return render(
    <MemoryRouter>
      <ConceptPracticePanel courseId="physics" skills={skills} disabled={disabled} />
    </MemoryRouter>,
  );
}

describe('Concept practice controls', () => {
  beforeEach(() => {
    vi.mocked(startConceptPractice).mockReset();
  });
  it('starts the selected skill and disables the chooser and action while starting', async () => {
    let rejectStart!: (error: Error) => void;
    vi.mocked(startConceptPractice).mockReturnValue(new Promise((_, reject) => {
      rejectStart = reject;
    }));
    view(Array.from({ length: 7 }, (_, index) => ({ ...skill, conceptId: `skill-${index}` })));
    const chooser = screen.getByRole('combobox', { name: 'All skills' });
    const action = screen.getByRole('button', { name: 'Practise selected skill' });
    expect(action).toBeDisabled();
    fireEvent.change(chooser, { target: { value: 'skill-6' } });
    expect(action).toBeEnabled();
    fireEvent.click(action);
    expect(startConceptPractice).toHaveBeenCalledWith('physics', 'skill-6', {
      allowFamiliar: false,
      mode: 'due',
      blueprint: {},
    });
    expect(chooser).toBeDisabled();
    expect(action).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Starting practice');
    rejectStart(new Error('Could not start.'));
    await screen.findByRole('alert');
    expect(chooser).toBeEnabled();
    expect(chooser).toHaveValue('skill-6');
    expect(action).toBeEnabled();
  });
  it('disables the all-skills controls when practice is disabled', () => {
    view(Array.from({ length: 7 }, (_, index) => ({ ...skill, conceptId: `skill-${index}` })), true);
    expect(screen.getByRole('combobox', { name: 'All skills' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Practise selected skill' })).toBeDisabled();
  });
  it('requires an explicit familiar choice after unseen pool exhaustion', async () => {
    vi.mocked(startConceptPractice).mockRejectedValue(
      new ConceptPracticeExhaustedError('no-unseen-questions'),
    );
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Practise Density' }));
    await screen.findByText(/No unseen questions remain/);
    expect(startConceptPractice).toHaveBeenCalledTimes(1);
    expect(startConceptPractice).toHaveBeenLastCalledWith('physics', 'density', {
      allowFamiliar: false,
      mode: 'due',
      blueprint: {},
    });
    fireEvent.click(screen.getByRole('button', { name: 'Practise familiar questions' }));
    await waitFor(() =>
      expect(startConceptPractice).toHaveBeenLastCalledWith('physics', 'density', {
        allowFamiliar: true,
        mode: 'due',
        blueprint: {},
      }),
    );
  });
  it('shows failures without starting an unrequested fallback', async () => {
    vi.mocked(startConceptPractice).mockRejectedValue(
      new Error('Saved receipt could not be read.'),
    );
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Practise due skills' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Saved receipt could not be read.');
    expect(
      screen.queryByRole('button', { name: 'Practise familiar questions' }),
    ).not.toBeInTheDocument();
  });
});
