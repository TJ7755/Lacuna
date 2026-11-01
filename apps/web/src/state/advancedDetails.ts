import { createLocalSetting } from './localSetting';

const setting = createLocalSetting<boolean>({
  key: 'lacuna.advancedDetails',
  event: 'lacuna:advanced-details',
  // An absent preference retains the existing learner's view.
  parse: (raw) => raw !== 'false',
});

export const readAdvancedDetails = setting.read;
export const writeAdvancedDetails = setting.write;
export const useAdvancedDetails = setting.use;

export function initialiseAdvancedDetailsForNewLearner(): void {
  if (localStorage.getItem(setting.key) === null) setting.write(false);
}
