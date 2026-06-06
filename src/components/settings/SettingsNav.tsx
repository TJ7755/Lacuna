import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring, type MotionValue } from 'motion/react';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { cn } from '../ui/cn';

interface SettingsSection {
  id: string;
  label: string;
}

interface SettingsNavProps {
  sections: SettingsSection[];
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function getScrollParent(element: HTMLElement): HTMLElement {
  let parent = element.parentElement;
  while (parent) {
    const style = window.getComputedStyle(parent);
    if (/(auto|scroll)/.test(style.overflow + style.overflowY)) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return document.documentElement;
}

function getOffsetTopRelativeTo(element: HTMLElement, ancestor: HTMLElement): number {
  let top = 0;
  let el: HTMLElement | null = element;
  while (el && el !== ancestor) {
    top += el.offsetTop;
    el = el.offsetParent as HTMLElement | null;
  }
  return top;
}

function smoothScrollTo(element: HTMLElement, duration: number) {
  const scrollParent = getScrollParent(element);
  const startTop = scrollParent.scrollTop;
  const targetTop = getOffsetTopRelativeTo(element, scrollParent) - 32;
  const distance = targetTop - startTop;
  const startTime = performance.now();

  function tick(now: number) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeInOutCubic(progress);
    scrollParent.scrollTop = startTop + distance * eased;
    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}

/** Compute a gravitational pull scale based on distance from the cursor.
 *  Items close to the cursor grow; items far away stay at base size. */
function computePullScale(
  mouseX: number,
  mouseY: number,
  rect: DOMRect,
  maxScale: number,
  radius: number,
): number {
  const itemCx = rect.left + rect.width / 2;
  const itemCy = rect.top + rect.height / 2;
  const dist = Math.hypot(mouseX - itemCx, mouseY - itemCy);
  if (dist >= radius) return 1;
  const t = dist / radius; // 0 at cursor, 1 at edge
  const eased = 1 - t * t; // quadratic falloff for smooth feel
  return 1 + (maxScale - 1) * eased;
}

export function SettingsNav({ sections }: SettingsNavProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const baseDuration = 700;

  const handleClick = useCallback(
    (id: string) => {
      const element = document.getElementById(id);
      if (element) {
        smoothScrollTo(element, baseDuration * multiplier);
      }
    },
    [multiplier],
  );

  // Track which section is closest to the top of the viewport.
  useEffect(() => {
    const firstEl = sections.length > 0 ? document.getElementById(sections[0].id) : null;
    if (!firstEl) return;
    const scrollParent = getScrollParent(firstEl);

    const onScroll = () => {
      let bestId: string | null = null;
      let bestDist = Infinity;
      sections.forEach(({ id }) => {
        const el = document.getElementById(id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const dist = Math.abs(rect.top);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = id;
        }
      });
      if (bestId) setActiveId(bestId);
    };

    scrollParent.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => scrollParent.removeEventListener('scroll', onScroll);
  }, [sections]);

  // Shared motion values for mouse position (updated on container mousemove).
  const mouseX = useMotionValue(-9999);
  const mouseY = useMotionValue(-9999);

  return (
    <div
      className="sticky top-4 z-30 mb-8 hidden xl:block"
      onMouseMove={(e) => {
        mouseX.set(e.clientX);
        mouseY.set(e.clientY);
      }}
      onMouseLeave={() => {
        mouseX.set(-9999);
        mouseY.set(-9999);
      }}
    >
      <div className="flex items-center justify-center gap-1 rounded-2xl border border-line bg-surface/90 p-2 shadow-lg backdrop-blur-md">
        {sections.map((section) => (
          <NavItem
            key={section.id}
            section={section}
            isActive={activeId === section.id}
            mouseX={mouseX}
            mouseY={mouseY}
            onClick={() => handleClick(section.id)}
          />
        ))}
      </div>
    </div>
  );
}

function NavItem({
  section,
  isActive,
  mouseX,
  mouseY,
  onClick,
}: {
  section: SettingsSection;
  isActive: boolean;
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const scaleMotion = useMotionValue(1);
  const smoothScale = useSpring(scaleMotion, {
    stiffness: 400,
    damping: 30,
  });

  useEffect(() => {
    function refreshRect() {
      if (ref.current) rectRef.current = ref.current.getBoundingClientRect();
      update();
    }

    function update() {
      const rect = rectRef.current;
      if (!rect) return;
      const x = mouseX.get();
      const y = mouseY.get();
      scaleMotion.set(computePullScale(x, y, rect, 1.22, 110));
    }

    refreshRect();
    window.addEventListener('resize', refreshRect);
    window.addEventListener('scroll', refreshRect, { passive: true });

    const unsubX = mouseX.on('change', update);
    const unsubY = mouseY.on('change', update);

    return () => {
      unsubX();
      unsubY();
      window.removeEventListener('resize', refreshRect);
      window.removeEventListener('scroll', refreshRect);
    };
  }, [mouseX, mouseY, scaleMotion]);

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onClick}
      style={{ scale: smoothScale }}
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'relative cursor-pointer overflow-hidden rounded-xl border-0 px-4 py-2 text-[11px] font-medium outline-none transition-colors duration-200',
        isActive
          ? 'text-accent'
          : 'bg-transparent text-ink-soft hover:bg-accent-soft hover:text-accent',
      )}
    >
      {section.label}
      {isActive && (
        <motion.div
          layoutId="settings-nav-indicator"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="absolute bottom-0 left-1.5 right-1.5 h-0.5 rounded-full bg-accent"
        />
      )}
    </motion.button>
  );
}
