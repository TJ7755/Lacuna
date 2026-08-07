import { useEffect, useState } from 'react';

export const AUDIO_PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5] as const;
export type AudioPlaybackSpeed = (typeof AUDIO_PLAYBACK_SPEEDS)[number];

export interface AudioSettings {
  autoplay: boolean;
  playbackSpeed: AudioPlaybackSpeed;
}

const KEY = 'lacuna.audioSettings';
const EVENT = 'lacuna:audio-settings';
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { autoplay: true, playbackSpeed: 1 };

export function readAudioSettings(): AudioSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AudioSettings>;
    return {
      autoplay: typeof parsed.autoplay === 'boolean' ? parsed.autoplay : true,
      playbackSpeed: AUDIO_PLAYBACK_SPEEDS.includes(parsed.playbackSpeed as AudioPlaybackSpeed)
        ? (parsed.playbackSpeed as AudioPlaybackSpeed)
        : 1,
    };
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

export function writeAudioSettings(settings: AudioSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useAudioSettings(): [AudioSettings, (settings: AudioSettings) => void] {
  const [settings, setSettings] = useState(readAudioSettings);
  useEffect(() => {
    const update = () => setSettings(readAudioSettings());
    window.addEventListener('storage', update);
    window.addEventListener(EVENT, update);
    return () => {
      window.removeEventListener('storage', update);
      window.removeEventListener(EVENT, update);
    };
  }, []);
  return [
    settings,
    (next) => {
      writeAudioSettings(next);
      setSettings(next);
    },
  ];
}
