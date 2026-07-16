import { m as motion } from 'motion/react';
import { Button } from '../../components/ui/Button';
import { cn } from '../../components/ui/cn';
import { ChevronDownIcon, MenuIcon } from '../../components/ui/icons';
import { Toggle } from '../../components/ui/Toggle';
import { DEFAULT_NAV_ITEMS, useSidebarSettings } from '../../state/sidebarSettings';

export function SidebarSection({ motionMultiplier }: { motionMultiplier: number }) {
  const [sidebarSettings, setSidebarSettings] = useSidebarSettings();
  const visibleCount = sidebarSettings.navItems.filter((item) => item.visible).length;

  return (
    <motion.section
      id="settings-sidebar"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 * motionMultiplier, delay: 0.15 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
      className="mb-8 rounded-2xl border border-line bg-surface p-6"
    >
      <div className="mb-1 flex items-center gap-2 text-accent">
        <MenuIcon width={18} height={18} />
        <h2 className="font-display text-xl">Sidebar</h2>
      </div>
      <p className="mb-5 text-sm text-ink-soft">
        Control what information appears in the sidebar navigation and how compact it is.
      </p>
      <SettingToggle
        title="Show due card counts"
        description="Display the number of cards ready for review next to each course name in the sidebar, so you can see which courses need attention at a glance."
        checked={sidebarSettings.showDueCounts}
        onChange={(checked) => setSidebarSettings({ showDueCounts: checked })}
      />
      <SettingToggle
        bordered
        title="Show archived courses"
        description="Include archived courses in the sidebar list. Archived courses are hidden from the dashboard by default but can still be accessed via the sidebar."
        checked={sidebarSettings.showArchived}
        onChange={(checked) => setSidebarSettings({ showArchived: checked })}
      />
      <SettingToggle
        bordered
        title="Compact mode"
        description="Reduce padding and font sizes throughout the sidebar to fit more items on screen at once."
        checked={sidebarSettings.compactMode}
        onChange={(checked) => setSidebarSettings({ compactMode: checked })}
      />

      <div className="mt-6 border-t border-line pt-5">
        <div className="mb-1 text-sm">Primary navigation</div>
        <p className="mb-4 text-sm text-ink-soft">
          Reorder or hide the main nav items in the sidebar. At least one item must remain visible.
        </p>
        <div className="flex flex-col gap-2">
          {sidebarSettings.navItems.map((item, index) => {
            const canMoveUp = index > 0;
            const canMoveDown = index < sidebarSettings.navItems.length - 1;
            const canHide = item.visible ? visibleCount > 1 : true;
            return (
              <div key={item.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 transition-colors">
                <div className="flex flex-col gap-0.5">
                  <MoveButton
                    direction="up"
                    label={item.label}
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
                    label={item.label}
                    disabled={!canMoveDown}
                    onClick={() => {
                      const next = [...sidebarSettings.navItems];
                      const [removed] = next.splice(index, 1);
                      next.splice(index + 1, 0, removed);
                      setSidebarSettings({ navItems: next });
                    }}
                  />
                </div>
                <span className="flex-1 text-sm text-ink">{item.label}</span>
                <Toggle
                  checked={item.visible}
                  disabled={!canHide}
                  onChange={(checked) => {
                    const next = sidebarSettings.navItems.map((navItem) =>
                      navItem.id === item.id ? { ...navItem, visible: checked } : navItem,
                    );
                    setSidebarSettings({ navItems: next });
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setSidebarSettings({ navItems: DEFAULT_NAV_ITEMS })}>
            Reset to defaults
          </Button>
        </div>
      </div>
    </motion.section>
  );
}

function SettingToggle({
  title,
  description,
  checked,
  onChange,
  bordered = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  bordered?: boolean;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', bordered && 'mt-6 border-t border-line pt-5')}>
      <div className="min-w-0">
        <div className="text-sm">{title}</div>
        <p className="mt-1 text-sm text-ink-soft">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
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
        'flex h-5 w-5 items-center justify-center rounded text-ink-faint transition-colors focus-visible:ring-2 focus-visible:ring-accent',
        !disabled ? 'hover:bg-ink/5 hover:text-ink' : 'opacity-30',
      )}
      aria-label={`Move ${label} ${direction}`}
    >
      <ChevronDownIcon width={12} height={12} className={direction === 'up' ? 'rotate-180' : undefined} />
    </button>
  );
}
