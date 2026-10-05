import { createLocalSetting, oneOf } from './localSetting';

export type DashboardSort =
  | 'recent'
  | 'ready'
  | 'mastery'
  | 'exam'
  | 'name'
  | 'created';

const setting = createLocalSetting<DashboardSort>({
  key: 'lacuna.dashboardSort',
  event: 'lacuna:dashboard-sort',
  parse: oneOf(['recent', 'ready', 'mastery', 'exam', 'name', 'created'], 'recent'),
});

export const readDashboardSort = setting.read;
export const writeDashboardSort = setting.write;
export const useDashboardSort = setting.use;
