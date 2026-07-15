import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings } from './Settings';

const setStartInFocusMode = vi.fn();

vi.mock('../state/focusModePreference', () => ({
  useStartInFocusMode: () => [false, setStartInFocusMode],
}));

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast', vi.fn()],
  speedMultiplier: () => 1,
}));

vi.mock('../state/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', resolvedTheme: 'dark', setTheme: vi.fn() }),
}));

vi.mock('../state/AccentContext', () => ({
  ACCENTS: [],
  useAccent: () => ({ accent: 'amber', setAccent: vi.fn() }),
}));

vi.mock('../state/FontScaleContext', () => ({
  FONT_SCALE_STEPS: [],
  useFontScale: () => ({ scale: 1, setScale: vi.fn() }),
}));

vi.mock('../state/useData', () => ({ useBackups: () => [] }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('../components/import/UnifiedExportPanel', () => ({ UnifiedExportPanel: () => null }));
vi.mock('../state/gradingMode', () => ({ useGradingMode: () => ['silent', vi.fn()] }));
vi.mock('../state/typingSetting', () => ({ useTypingSetting: () => ['reveal', vi.fn()] }));
vi.mock('../state/optimiseSetting', () => ({ useAutoOptimiseDefault: () => [true, vi.fn()] }));
vi.mock('../state/practiceDefaults', () => ({
  usePracticeDefaults: () => [{
    autoPractice: true,
    practiceThresholdMinutesFar: 30,
    practiceThresholdMinutesNear: 15,
    practiceUrgentWindowDays: 7,
    practiceMaxGap: 5,
  }, vi.fn()],
}));
vi.mock('../state/dashboardSort', () => ({ useDashboardSort: () => ['recent', vi.fn()] }));
vi.mock('../state/courseCardDetail', () => ({
  useCourseCardDetail: () => [{ nextDue: true, breakdown: true, activity: true }, vi.fn()],
}));
vi.mock('../state/inputMode', () => ({
  useInputMode: () => ['auto', vi.fn()],
  useIsTouchMode: () => false,
}));
vi.mock('../state/sidebarSettings', () => ({
  DEFAULT_NAV_ITEMS: [],
  useSidebarSettings: () => [{
    showDueCounts: true,
    showArchived: true,
    compactMode: false,
    navItems: [],
  }, vi.fn()],
}));
vi.mock('../state/shortcutBindings', () => ({
  ACTION_LABELS: {},
  formatBinding: vi.fn(),
  useShortcutBindings: () => ({ bindings: {}, setBinding: vi.fn(), reset: vi.fn() }),
}));
vi.mock('../hooks/useInstallPrompt', () => ({
  useInstallPrompt: () => ({ isInstallable: false, isInstalled: false, promptInstall: vi.fn() }),
}));
vi.mock('../db/backups', () => ({
  backupFolderName: () => new Promise(() => {}),
  chooseBackupFolder: vi.fn(),
  clearBackupFolder: vi.fn(),
  deleteBackup: vi.fn(),
  folderMirrorSupported: () => false,
  restoreBackup: vi.fn(),
  takeAutoBackup: vi.fn(),
}));
vi.mock('../db/persistence', () => ({
  checkPersistentStorage: () => new Promise(() => {}),
  requestPersistentStorage: vi.fn(),
}));

class MockIntersectionObserver {
  observe() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'IntersectionObserver', {
  configurable: true,
  value: MockIntersectionObserver,
});

describe('Settings', () => {
  beforeEach(() => setStartInFocusMode.mockClear());

  it('updates the default Focus Mode preference', () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('switch', { name: 'Start Learn sessions in Focus Mode' }));

    expect(setStartInFocusMode).toHaveBeenCalledWith(true);
  });
});
