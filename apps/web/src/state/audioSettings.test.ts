import { beforeEach, expect, it } from 'vitest';
import { readAudioSettings } from './audioSettings';

beforeEach(() => localStorage.clear());

it('defaults to autoplay at normal speed', () => {
  expect(readAudioSettings()).toEqual({ autoplay: true, playbackSpeed: 1 });
});

it.each([
  [9, 1],
  [1.25, 1.25],
])('reads a saved speed of %s as %s', (stored, expected) => {
  localStorage.setItem(
    'lacuna.audioSettings',
    JSON.stringify({ autoplay: false, playbackSpeed: stored }),
  );
  expect(readAudioSettings()).toEqual({ autoplay: false, playbackSpeed: expected });
});
