import { createLocalSetting } from './localSetting';

const setting = createLocalSetting<boolean>({
  key: 'lacuna.startInFocusMode',
  event: 'lacuna:start-in-focus-mode',
  parse: (raw) => raw === 'on',
  serialise: (enabled) => (enabled ? 'on' : 'off'),
});

export const readStartInFocusMode = setting.read;
export const writeStartInFocusMode = setting.write;
export const useStartInFocusMode = setting.use;
