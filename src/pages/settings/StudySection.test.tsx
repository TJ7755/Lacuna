import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import {
  readAudioSettings,
  writeAudioSettings,
  DEFAULT_AUDIO_SETTINGS,
} from '../../state/audioSettings';
import { readAnswerStrictness, writeAnswerStrictness } from '../../state/answerStrictness';
import { StudySection } from './StudySection';

beforeEach(() => {
  writeAudioSettings(DEFAULT_AUDIO_SETTINGS);
  writeAnswerStrictness('standard');
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
  expect(readAnswerStrictness()).toBe('exact');
  expect(within(strictness).getByRole('radio', { name: 'exact' })).toHaveFocus();
});
