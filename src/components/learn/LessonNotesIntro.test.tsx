import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LessonNotesIntro } from './LessonNotesIntro';

vi.mock('./PomodoroTimer', () => ({ PomodoroTimer: () => null }));
vi.mock('../notes/LessonNotesStudyView', () => ({
  LessonNotesStudyView: () => <h2>Notes</h2>,
}));

describe('LessonNotesIntro', () => {
  it('shows the lesson name once without a redundant notes subtitle', () => {
    render(
      <LessonNotesIntro
        lessonName="Immunity"
        notes={[]}
        onExit={vi.fn()}
        onContinue={vi.fn()}
        motionMultiplier={0}
      />,
    );

    expect(screen.getAllByText('Immunity')).toHaveLength(1);
    expect(screen.queryByText('Lesson notes')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
  });
});
