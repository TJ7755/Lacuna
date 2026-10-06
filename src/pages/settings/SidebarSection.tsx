import { Button } from '../../components/ui/Button';
import { SettingsSectionHeading } from './SettingsSectionHeading';
import { cn } from '../../components/ui/cn';
import { ChevronDownIcon, MenuIcon } from '../../components/ui/icons';
import { DEFAULT_NAV_ITEMS, useSidebarSettings } from '../../state/sidebarSettings';
import { PillSwitch, SETTINGS_HEADING_ROW_CLASS, SettingsCard } from './SettingsUi';

export function SidebarSection() {
  const [sidebarSettings, setSidebarSettings] = useSidebarSettings();
  const visibleCount = sidebarSettings.navItems.filter((item) => item.visible).length;

  return (
    <SettingsCard id="settings-sidebar">
      <div className={cn('mb-5', SETTINGS_HEADING_ROW_CLASS)}>
        <MenuIcon width={18} height={18} />
        <SettingsSectionHeading className="font-display text-xl font-semibold tracking-tight">
          Sidebar
        </SettingsSectionHeading>
      </div>
      <SettingToggle
        title="Show course hover details"
        checked={sidebarSettings.showDueCounts}
        onChange={(checked) => setSidebarSettings({ showDueCounts: checked })}
      />
      <SettingToggle
        bordered
        title="Compact mode"
        checked={sidebarSettings.compactMode}
        onChange={(checked) => setSidebarSettings({ compactMode: checked })}
      />

      <div className="mt-6 pt-0">
        <div className="mb-3 text-sm">Primary navigation</div>
        <div className="flex flex-col gap-2">
          {sidebarSettings.navItems.map((item, index) => {
            const canMoveUp = index > 0;
            const canMoveDown = index < sidebarSettings.navItems.length - 1;
            const canHide = item.visible ? visibleCount > 1 : true;
            const label = item.id === 'search' ? 'Search entry' : item.label;
            return (
              <div
                key={item.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-line px-3 py-2 transition-colors sm:grid-cols-[auto_minmax(0,1fr)_auto]"
              >
                <div className="col-span-2 row-start-2 flex gap-0.5 sm:col-span-1 sm:col-start-1 sm:row-start-1">
                  <MoveButton
                    direction="up"
                    label={label}
                    disabled={!canMoveUp}
                    onClick={() => {
                      const next = [...sidebarSettings.navItems];
                      const [removed] = next.splice(index, 1);
                      next.splice(index - 1, 0, removed);
                      setSidebarSettings({ navItems: next });
                    }}
                  />
                  <MoveButton
                    direction="down"
                    label={label}
                    disabled={!canMoveDown}
                    onClick={() => {
                      const next = [...sidebarSettings.navItems];
                      const [removed] = next.splice(index, 1);
                      next.splice(index + 1, 0, removed);
                      setSidebarSettings({ navItems: next });
                    }}
                  />
                </div>
                <span className="col-start-1 row-start-1 min-w-0 break-words text-sm text-ink sm:col-start-2">
                  {label}
                </span>
                <div className="col-start-2 row-start-1 sm:col-start-3">
                  <PillSwitch
                    checked={item.visible}
                    disabled={!canHide}
                    ariaLabel={`Show ${label}`}
                    onChange={(checked) => {
                      const next = sidebarSettings.navItems.map((navItem) =>
                        navItem.id === item.id ? { ...navItem, visible: checked } : navItem,
                      );
                      setSidebarSettings({ navItems: next });
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarSettings({ navItems: DEFAULT_NAV_ITEMS })}
          >
            Reset to defaults
          </Button>
        </div>
      </div>
    </SettingsCard>
  );
}

function SettingToggle({
  title,
  checked,
  onChange,
  bordered = false,
}: {
  title: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  bordered?: boolean;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', bordered && 'mt-6 pt-0')}>
      <div className="min-w-0">
        <div className="text-sm">{title}</div>
      </div>
      <PillSwitch checked={checked} onChange={onChange} ariaLabel={title} />
    </div>
  );
}

function MoveButton({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: 'up' | 'down';
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-full text-ink-faint transition-colors focus-visible:ring-2 focus-visible:ring-accent',
        !disabled ? 'hover:bg-ink/5 hover:text-ink' : 'opacity-30',
      )}
      aria-label={`Move ${label} ${direction}`}
    >
      <ChevronDownIcon
        width={16}
        height={16}
        className={direction === 'up' ? 'rotate-180' : undefined}
      />
    </button>
  );
}
