import { createLocalSetting, parseJson } from './localSetting';

export const AUDIO_PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5] as const;
export type AudioPlaybackSpeed = (typeof AUDIO_PLAYBACK_SPEEDS)[number];

export interface AudioSettings {
  autoplay: boolean;
  playbackSpeed: AudioPlaybackSpeed;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { autoplay: true, playbackSpeed: 1 };

const setting = createLocalSetting<AudioSettings>({
  key: 'lacuna.audioSettings',
  event: 'lacuna:audio-settings',
  parse: (raw) =>
    parseJson(
      raw,
      () => DEFAULT_AUDIO_SETTINGS,
      (value) => {
        const parsed = value as Partial<AudioSettings>;
        return {
          autoplay: typeof parsed.autoplay === 'boolean' ? parsed.autoplay : true,
          playbackSpeed: AUDIO_PLAYBACK_SPEEDS.includes(parsed.playbackSpeed as AudioPlaybackSpeed)
            ? (parsed.playbackSpeed as AudioPlaybackSpeed)
            : 1,
        };
      },
    ),
  serialise: JSON.stringify,
});

export const readAudioSettings = setting.read;
export const writeAudioSettings = setting.write;
export const useAudioSettings = setting.use;
