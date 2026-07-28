import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings } from './Settings';

const setStartInFocusMode = vi.fn();
const setCourseCardMetric = vi.fn();
const setMotionSpeed = vi.fn();

vi.mock('../state/focusModePreference', () => ({
  useStartInFocusMode: () => [false, setStartInFocusMode],
}));

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast', setMotionSpeed],
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
vi.mock('../state/courseCardMetric', () => ({
  useCourseCardMetric: () => ['curriculum', setCourseCardMetric],
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
  beforeEach(() => {
    setStartInFocusMode.mockClear();
    setCourseCardMetric.mockClear();
    setMotionSpeed.mockClear();
  });

  it('updates the default Focus Mode preference', () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('switch', { name: 'Start Learn sessions in Focus Mode' }));

    expect(setStartInFocusMode).toHaveBeenCalledWith(true);
  });

  it('labels the typing setting switch', () => {
    render(<Settings />);

    expect(screen.getByRole('switch', { name: 'Type your answer' })).toBeInTheDocument();
  });

  it('selects the course card progress metric', () => {
    render(<Settings />);

    expect(screen.getByRole('button', { name: 'Curriculum progress' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: "Today's workload" }));

    expect(setCourseCardMetric).toHaveBeenCalledWith('today');
  });

  it('presents animation speed as three explicit choices', () => {
    render(<Settings />);

    const group = screen.getByRole('radiogroup', { name: 'Animation speed' });
    const choices = Array.from(group.querySelectorAll('[role="radio"]'));
    expect(choices).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Fast' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('radio', { name: 'Slow' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Normal' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Fast' }));

    expect(setMotionSpeed.mock.calls).toEqual([['slow'], ['normal'], ['fast']]);
  });

  it('supports standard keyboard navigation for animation speed', () => {
    render(<Settings />);

    const fast = screen.getByRole('radio', { name: 'Fast' });
    fireEvent.keyDown(fast, { key: 'ArrowLeft' });
    expect(setMotionSpeed).toHaveBeenLastCalledWith('normal');
    expect(screen.getByRole('radio', { name: 'Normal' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Normal' }), { key: 'Home' });
    expect(setMotionSpeed).toHaveBeenLastCalledWith('slow');
    expect(screen.getByRole('radio', { name: 'Slow' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Slow' }), { key: 'End' });
    expect(setMotionSpeed).toHaveBeenLastCalledWith('fast');
    expect(fast).toHaveFocus();
  });

  it('labels switches whose visible descriptions sit outside the control', () => {
    render(<Settings />);

    expect(screen.getByRole('switch', { name: 'Show ready card counts' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Show archived courses' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Compact mode' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Manual four-point grading' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Optimise scheduling' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Auto-insert practice nodes' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Auto-start breaks' })).toBeInTheDocument();
  });
});
