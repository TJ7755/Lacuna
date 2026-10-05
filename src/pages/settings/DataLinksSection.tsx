import { m as motion } from 'motion/react';
import { ChevronRightIcon, DownloadIcon, ShareIcon } from '../../components/ui/icons';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { SettingsCard } from './SettingsUi';

// Importing cards and sharing a course live on their own pages. These rows are the
// way in from Your data; they are plain hash links so the section needs no router.
const LINKS = [
  { href: '#/import', label: 'Bring cards in', Icon: DownloadIcon },
  { href: '#/share', label: 'Share a course', Icon: ShareIcon },
];

export function DataLinksSection() {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);

  return (
    <SettingsCard id="settings-data-links" className="p-3 md:p-3">
      <ul className="flex flex-col">
        {LINKS.map(({ href, label, Icon }) => (
          <li key={href}>
            <motion.a
              href={href}
              data-press=""
              whileTap={multiplier > 0 ? { scale: 0.985 } : undefined}
              className="group flex min-h-14 items-center gap-3 rounded-2xl px-4 py-2 text-ink transition-colors hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <span
                aria-hidden="true"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink"
              >
                <Icon width={18} height={18} />
              </span>
              <span className="flex-1 font-display text-lg font-semibold tracking-tight">
                {label}
              </span>
              <ChevronRightIcon
                width={18}
                height={18}
                className="text-ink-faint transition-transform duration-150 group-hover:translate-x-0.5"
              />
            </motion.a>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}
