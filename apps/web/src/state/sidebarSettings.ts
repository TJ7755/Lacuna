import { createLocalSetting, parseJson } from './localSetting';

// Device-local sidebar preferences.

export interface SidebarNavItem {
  id: string;
  label: string;
  visible: boolean;
}

export interface SidebarSettings {
  showDueCounts: boolean;
  compactMode: boolean;
  navItems: SidebarNavItem[];
}

export const DEFAULT_NAV_ITEMS: SidebarNavItem[] = [
  { id: 'dashboard', label: 'Today', visible: true },
  { id: 'search', label: 'Search', visible: true },
  { id: 'share', label: 'Share', visible: true },
  { id: 'analytics', label: 'Progress', visible: true },
  { id: 'settings', label: 'Settings', visible: true },
  { id: 'help', label: 'Help', visible: true },
];

const DEFAULTS: SidebarSettings = {
  showDueCounts: true,
  compactMode: false,
  navItems: DEFAULT_NAV_ITEMS,
};

/** Navigation groups share their order between customisation and the sidebar. */
export const FOOTER_NAV = new Set(['share', 'settings', 'help']);

const setting = createLocalSetting<SidebarSettings>({
  key: 'lacuna.sidebarSettings',
  event: 'lacuna:sidebar-settings',
  parse: (raw) =>
    parseJson(
      raw,
      () => ({ ...DEFAULTS }),
      (value) => {
        const parsed = value as Partial<SidebarSettings>;
        const navItems = parsed.navItems ?? DEFAULTS.navItems;
        // Drop stored items whose id no longer exists as a default (e.g. a removed nav
        // entry), then merge in any newly added defaults — preserving the stored order
        // and visibility of everything that survives.
        const merged = navItems.flatMap((n) => {
          const def = DEFAULT_NAV_ITEMS.find((item) => item.id === n.id);
          return def ? [{ ...n, label: def.label, visible: n.id === 'settings' || n.visible }] : [];
        });
        for (const def of DEFAULT_NAV_ITEMS) {
          if (!merged.find((n) => n.id === def.id)) {
            merged.push(def);
          }
        }
        return {
          showDueCounts: parsed.showDueCounts ?? DEFAULTS.showDueCounts,
          compactMode: parsed.compactMode ?? DEFAULTS.compactMode,
          navItems: merged,
        };
      },
    ),
  serialise: JSON.stringify,
});

export function useSidebarSettings(): [SidebarSettings, (patch: Partial<SidebarSettings>) => void] {
  const [settings, setSettings] = setting.use();
  return [settings, (patch) => setSettings({ ...setting.read(), ...patch })];
}
