import { m as motion } from 'motion/react';
import { GaugeIcon } from '../../components/ui/icons';
import { Toggle } from '../../components/ui/Toggle';
import { useCourseHeaderSettings } from '../../state/courseHeaderSettings';

/**
 * Which stat pills a course header shows. Which of them read as useful depends on how
 * someone studies — a fixed exam date makes the countdown matter, an open-ended course
 * makes it noise — so this is a preference rather than a fixed set.
 */
export function CourseHeaderSection({ motionMultiplier }: { motionMultiplier: number }) {
  const [settings, setSettings] = useCourseHeaderSettings();

  return (
    <motion.section
      id="settings-course-header"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.24 * motionMultiplier,
        delay: 0.18 * motionMultiplier,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="mb-8 rounded-2xl border border-line bg-surface p-6"
    >
      <div className="mb-1 flex items-center gap-2 text-accent">
        <GaugeIcon width={18} height={18} />
        <h2 className="font-display text-xl">Course header</h2>
      </div>
      <p className="mb-5 text-sm text-ink-soft">
        Choose which figures appear beside a course title. Cards due and mastery are shown by
        default; add the others if you act on them.
      </p>

      <div className="flex flex-col gap-2">
        {settings.statPills.map((pill) => (
          <div
            key={pill.id}
            className="flex items-center gap-2 rounded-lg border border-line px-3 py-2"
          >
            <span className="flex-1 text-sm text-ink">{pill.label}</span>
            <Toggle
              checked={pill.visible}
              ariaLabel={`Show ${pill.label}`}
              onChange={(checked) => {
                setSettings({
                  statPills: settings.statPills.map((item) =>
                    item.id === pill.id ? { ...item, visible: checked } : item,
                  ),
                });
              }}
            />
          </div>
        ))}
      </div>
    </motion.section>
  );
}
