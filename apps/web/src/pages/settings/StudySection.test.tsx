import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { readAudioSettings } from '../../state/audioSettings';
import { StudySection, CourseDefaultsSection } from './StudySection';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lacuna.answerStrictness', 'standard');
});

it('persists keyboard choices for speed and strictness while retaining autoplay', () => {
  render(<StudySection />);
  const speed = screen.getByRole('radiogroup', { name: 'Audio playback speed' });
  fireEvent.keyDown(within(speed).getByRole('radio', { name: '1×' }), { key: 'End' });
  expect(within(speed).getByRole('radio', { name: '1.5×' })).toBeChecked();
  expect(readAudioSettings()).toEqual({ autoplay: true, playbackSpeed: 1.5 });
  const strictness = screen.getByRole('radiogroup', { name: 'Grading strictness' });
  fireEvent.keyDown(within(strictness).getByRole('radio', { name: 'standard' }), {
    key: 'ArrowRight',
  });
  expect(localStorage.getItem('lacuna.answerStrictness')).toBe('exact');
  expect(within(strictness).getByRole('radio', { name: 'exact' })).toHaveFocus();
});

it('lets the learner restore scheduler details from Settings without changing scheduling', () => {
  localStorage.setItem('lacuna.advancedDetails', 'false');
  render(
    <>
      <StudySection />
      <CourseDefaultsSection />
    </>,
  );
  const details = screen.getByRole('switch', { name: 'Show advanced details' });
  expect(details).not.toBeChecked();
  expect(screen.queryByText('Advanced scheduling')).not.toBeInTheDocument();
  expect(screen.queryByText('Advanced practice timing')).not.toBeInTheDocument();
  fireEvent.click(details);
  expect(details).toBeChecked();
  expect(localStorage.getItem('lacuna.advancedDetails')).toBe('true');
  expect(screen.getByText('Advanced scheduling')).toBeInTheDocument();
  expect(screen.getByText('Advanced practice timing')).toBeInTheDocument();
  fireEvent.click(details);
  expect(screen.queryByText('Advanced scheduling')).not.toBeInTheDocument();
  expect(screen.queryByText('Advanced practice timing')).not.toBeInTheDocument();
});
