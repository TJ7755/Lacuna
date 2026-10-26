import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings } from './Settings';
import { SettingsDisclosure } from './settings/SettingsDisclosure';
import { backupFolderName } from '../db/backupFolder';

const setStartInFocusMode = vi.fn();
const setCourseCardMetric = vi.fn();
const setMotionSpeed = vi.fn();
const scrollIntoView = vi.fn();

vi.mock('../state/focusModePreference', () => ({
  useStartInFocusMode: () => [false, setStartInFocusMode],
}));

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast', setMotionSpeed],
  speedMultiplier: () => 0,
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
vi.mock('../db/mutationStamp', () => ({ readSyncState: () => new Promise(() => {}) }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('../components/import/UnifiedExportPanel', () => ({ UnifiedExportPanel: () => null }));
vi.mock('../state/gradingMode', () => ({ useGradingMode: () => ['silent', vi.fn()] }));
vi.mock('../state/optimiseSetting', () => ({ useAutoOptimiseDefault: () => [true, vi.fn()] }));
vi.mock('../state/practiceDefaults', () => ({
  usePracticeDefaults: () => [
    {
      autoPractice: true,
      practiceThresholdMinutesFar: 30,
      practiceThresholdMinutesNear: 15,
      practiceUrgentWindowDays: 7,
      practiceMaxGap: 5,
    },
    vi.fn(),
  ],
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
  useSidebarSettings: () => [
    {
      showDueCounts: true,
      compactMode: false,
      navItems: [
        { id: 'dashboard', label: 'Dashboard', visible: true },
        { id: 'search', label: 'Search', visible: true },
      ],
    },
    vi.fn(),
  ],
}));
vi.mock('../state/finalExamLifecycle', () => ({
  useAfterFinalExamPolicy: () => ['ask', vi.fn()],
}));
vi.mock('../state/shortcutBindings', () => ({
  ACTION_LABELS: {},
  formatBinding: vi.fn(),
  useShortcutBindings: () => ({ bindings: {}, setBinding: vi.fn(), reset: vi.fn() }),
}));
vi.mock('../db/backups', () => ({
  deleteBackup: vi.fn(),
  restoreBackup: vi.fn(),
  takeAutoBackup: vi.fn(),
}));
vi.mock('../db/backupFolder', () => ({
  backupFolderName: vi.fn(() => new Promise(() => {})),
  chooseBackupFolder: vi.fn(),
  clearBackupFolder: vi.fn(),
  folderMirrorSupported: () => false,
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

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: scrollIntoView,
});

describe('Settings', () => {
  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', '0.2.8');
    setStartInFocusMode.mockClear();
    setCourseCardMetric.mockClear();
    setMotionSpeed.mockClear();
    scrollIntoView.mockClear();
    vi.mocked(backupFolderName).mockClear();
    window.location.hash = '';
    localStorage.clear();
  });

  it('updates the default Focus Mode preference', () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: /^Study behaviour/ }));

    fireEvent.click(screen.getByRole('switch', { name: 'Start Learn sessions in focus mode' }));

    expect(setStartInFocusMode).toHaveBeenCalledWith(true);
  });

  it('persists the global answer input preference', () => {
    const view = render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: /^Study behaviour/ }));
    expect(screen.getByRole('radio', { name: 'As the course suggests' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Typing where possible' }));
    expect(localStorage.getItem('lacuna.answerInput')).toBe('type');
    view.unmount();
    render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: /^Study behaviour/ }));
    expect(screen.getByRole('radio', { name: 'Typing where possible' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Revealing' }));
    expect(localStorage.getItem('lacuna.answerInput')).toBe('reveal');
    fireEvent.click(screen.getByRole('radio', { name: 'As the course suggests' }));
    expect(localStorage.getItem('lacuna.answerInput')).toBe('course');
  });

  it('selects the course card progress metric', () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: /^Appearance & access/ }));

    expect(screen.getByRole('button', { name: 'Course progress' })).toHaveAttribute(
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
    fireEvent.click(screen.getByRole('button', { name: /^Appearance & access/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Study behaviour/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Course defaults/ }));

    expect(screen.getByRole('switch', { name: 'Show course hover details' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'After the final exam' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Ask me/ })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Compact mode' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Manual four-point grading' })).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Optimise scheduling', hidden: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Auto-insert practice nodes' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Auto-start breaks' })).toBeInTheDocument();
  });

  it('names primary navigation visibility switches and numeric settings fields', () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: /^Appearance & access/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Course defaults/ }));

    expect(screen.getByRole('switch', { name: 'Show Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Show Search entry' })).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', {
        name: 'Threshold (far)',
        hidden: true,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', { name: 'Focus duration, in minutes' }),
    ).toBeInTheDocument();
  });

  it('organises settings into five task groups while preserving existing section anchors', () => {
    render(<Settings />);

    expect(screen.queryByText('Settings group')).not.toBeInTheDocument();

    expect(screen.queryByLabelText('Jump to settings group')).not.toBeInTheDocument();
    expect(document.querySelectorAll('section[id^="settings-group-"]')).toHaveLength(5);
    [
      'Appearance & access',
      'Study behaviour',
      'Course defaults',
      'Your data',
      'Integrations',
    ].forEach((title) => {
      expect(screen.getByRole('button', { name: new RegExp(`^${title}`) })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });

    const membership = {
      'settings-group-appearance': [
        'settings-sidebar',
        'settings-dashboard',
        'settings-course-header',
        'settings-shortcuts',
      ],
      'settings-group-study': ['settings-study'],
      'settings-group-course-defaults': ['settings-course-defaults'],
      'settings-group-data': [
        'settings-backups',
        'settings-data-links',
        'settings-sync',
        'settings-export',
      ],
      'settings-group-integrations': ['settings-install', 'settings-jev'],
    };

    Object.entries(membership).forEach(([groupId, childIds]) => {
      const group = document.getElementById(groupId);
      fireEvent.click(group!.querySelector('button')!);
      childIds.forEach((childId) =>
        expect(group).toContainElement(document.getElementById(childId)),
      );
    });
  });

  it('keeps every web settings section exactly once', () => {
    render(<Settings />);
    const ids = Array.from(document.querySelectorAll('section[id^="settings-"]')).map(
      (section) => section.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('retains the same controls when a group closes', () => {
    render(<Settings />);
    const toggle = screen.getByRole('button', { name: /^Your data/ });
    fireEvent.click(toggle);
    const sync = document.getElementById('settings-sync');
    fireEvent.click(toggle);
    expect(document.getElementById('settings-sync')).toBe(sync);
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toHaveAttribute('inert');
    expect(document.querySelectorAll('#settings-sync')).toHaveLength(1);
  });

  it('defers backup reads until Your data is opened and retains them on closing', () => {
    render(<Settings />);
    expect(backupFolderName).not.toHaveBeenCalled();

    const toggle = screen.getByRole('button', { name: /^Your data/ });
    fireEvent.click(toggle);
    expect(backupFolderName).toHaveBeenCalledTimes(1);
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(backupFolderName).toHaveBeenCalledTimes(1);
  });

  it('captures an install prompt before Integrations is first opened', async () => {
    render(<Settings />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    fireEvent(
      window,
      Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt,
        userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Integrations/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText('Lacuna is installed on this device and can be used offline.'),
    ).toBeInTheDocument();
  });

  it('keeps an unfinished form mounted and inaccessible while its group is closed', () => {
    render(
      <SettingsDisclosure id="form-group" title="Form" summary="" anchors={[]}>
        <input aria-label="Draft" defaultValue="" />
      </SettingsDisclosure>,
    );
    const toggle = screen.getByRole('button', { name: 'Form' });
    expect(screen.queryByRole('textbox', { name: 'Draft' })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    const draft = screen.getByRole('textbox', { name: 'Draft' });
    fireEvent.change(draft, { target: { value: 'unfinished' } });
    fireEvent.click(toggle);
    expect(screen.queryByRole('textbox', { name: 'Draft' })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(draft);
    expect(draft).toHaveValue('unfinished');
  });

  it('renders task groups, sections and subsections at successive heading levels', () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: /^Appearance & access/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Study behaviour/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Your data/ }));

    expect(
      screen.getByRole('heading', { level: 2, name: /^Appearance & access/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Appearance' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Session behaviour' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Full backup and recovery' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 4, name: 'Course progress metric' }),
    ).toBeInTheDocument();
  });

  it('scrolls a routed secondary hash to the preserved child section', () => {
    window.location.hash = '#/settings#settings-export';

    render(<Settings />);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    const target = document.getElementById('settings-export');
    expect(scrollIntoView.mock.instances[0]).toBe(target);
    expect(screen.getByRole('button', { name: /^Your data/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('opens a closed group for a later hash change and allows it to close again', () => {
    render(<Settings />);
    window.location.hash = '#/settings#settings-study';
    fireEvent(window, new Event('hashchange'));
    const toggle = screen.getByRole('button', { name: /^Study behaviour/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('switch', { name: 'Manual four-point grading' })).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps global scheduler internals closed behind deliberate disclosures', () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: /^Course defaults/ }));

    const scheduling = screen.getByText('Advanced scheduling').closest('button');
    const practiceTiming = screen.getByText('Advanced practice timing').closest('button');

    expect(scheduling).toHaveAttribute('aria-expanded', 'false');
    expect(practiceTiming).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('switch', { name: 'Optimise scheduling', hidden: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', { name: 'Threshold (far)', hidden: true }),
    ).toBeInTheDocument();
  });
});
