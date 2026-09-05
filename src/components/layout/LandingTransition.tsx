import { useEffect, useState } from 'react';
import { m as motion } from 'motion/react';
import { getMotionMultiplier } from '../../state/motionSpeed';

// The overlay survives route navigation. Grow from the clicked link, navigate
// once covered, then lift a single amber surface to reveal the dashboard.
const BEGIN_EVENT = 'lacuna:landing-transition';
export const COVERED_EVENT = 'lacuna:landing-covered';
const ARRIVAL_KEY = 'lacuna.landingArrival';

const SWEEP_EASE = [0.65, 0, 0.25, 1] as const;
const REVEAL_EASE = [0.22, 1, 0.36, 1] as const;

interface Appearance {
  colour: string;
  radius: string;
}

export function beginLandingTransition(rect: DOMRect, appearance: Appearance): void {
  sessionStorage.setItem(ARRIVAL_KEY, '1');
  window.dispatchEvent(new CustomEvent(BEGIN_EVENT, { detail: { rect, ...appearance } }));
}

/** One-shot check for the arrival flag set by beginLandingTransition. */
export function consumeLandingArrival(): boolean {
  const arrived = sessionStorage.getItem(ARRIVAL_KEY) === '1';
  if (arrived) sessionStorage.removeItem(ARRIVAL_KEY);
  return arrived;
}

interface Transition extends Appearance {
  rect: DOMRect;
  covered: boolean;
}

export function LandingTransition() {
  const [transition, setTransition] = useState<Transition | null>(null);

  useEffect(() => {
    const onBegin = (event: Event) => {
      setTransition({
        ...(event as CustomEvent<Omit<Transition, 'covered'>>).detail,
        covered: false,
      });
    };
    window.addEventListener(BEGIN_EVENT, onBegin);
    return () => window.removeEventListener(BEGIN_EVENT, onBegin);
  }, []);

  if (!transition) return null;
  const { rect, covered, colour, radius } = transition;
  const multiplier = getMotionMultiplier();
  const coverTransform = `translate3d(${-rect.left}px, ${-rect.top}px, 0) scale(${innerWidth / rect.width}, ${innerHeight / rect.height})`;

  return (
    <div className="fixed inset-0 z-[100]" data-landing-transition role="presentation">
      <motion.div
        key={covered ? 'reveal' : 'cover'}
        className={covered ? 'absolute inset-0' : 'absolute'}
        style={
          covered
            ? { backgroundColor: colour, willChange: 'transform' }
            : {
                backgroundColor: colour,
                borderRadius: radius,
                height: rect.height,
                left: rect.left,
                top: rect.top,
                transformOrigin: '0 0',
                width: rect.width,
                willChange: 'transform',
              }
        }
        initial={
          covered
            ? { transform: 'translateY(0%)' }
            : { transform: 'translate3d(0, 0, 0) scale(1, 1)', borderRadius: radius }
        }
        animate={
          covered
            ? { transform: 'translateY(-100%)' }
            : { transform: coverTransform, borderRadius: '0px' }
        }
        transition={
          covered
            ? { duration: 0.65 * multiplier, ease: REVEAL_EASE }
            : {
                transform: { duration: 0.65 * multiplier, ease: SWEEP_EASE },
                borderRadius: { duration: 0.1 * multiplier, ease: SWEEP_EASE },
              }
        }
        onAnimationComplete={() => {
          if (covered) setTransition(null);
          else {
            window.dispatchEvent(new CustomEvent(COVERED_EVENT));
            setTransition((current) => (current ? { ...current, covered: true } : null));
          }
        }}
      />
    </div>
  );
}
