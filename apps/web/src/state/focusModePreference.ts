import { createLocalSetting } from './localSetting';

const setting = createLocalSetting<boolean>({
  key: 'lacuna.startInFocusMode',
  event: 'lacuna:start-in-focus-mode',
  parse: (raw) => raw === 'on',
  serialise: (enabled) => (enabled ? 'on' : 'off'),
});

export const useStartInFocusMode = setting.use;
