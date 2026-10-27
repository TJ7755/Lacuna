import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { CloseIcon } from '../ui/icons';
import { STUDY_HEADER_ROW } from '../learn/studyHeaderLayout';
import { m as motion } from 'motion/react';
import { getMotionMultiplier } from '../../state/motionSpeed';

// The overlay survives route navigation. Grow from the clicked link, navigate
// once covered, then lift a single accent surface to reveal the dashboard.
const BEGIN_EVENT = 'lacuna:landing-transition';
export const COVERED_EVENT = 'lacuna:landing-covered';
const RELEASE_EVENT = 'lacuna:study-reveal';
export const STUDY_EXIT_EVENT = 'lacuna:study-exit';
const ARRIVAL_KEY = 'lacuna.landingArrival';

const SWEEP_EASE = [0.16, 1, 0.3, 1] as const;
const REVEAL_EASE = [0.22, 1, 0.36, 1] as const;

interface Appearance {
  colour: string;
  radius: string;
}

export function beginLandingTransition(rect: DOMRect, appearance: Appearance): void {
  sessionStorage.setItem(ARRIVAL_KEY, '1');
  window.dispatchEvent(new CustomEvent(BEGIN_EVENT, { detail: { rect, ...appearance } }));
}

/** The route boundary can skip its fade while the solid launch cover is present. */
export function hasLandingArrival(): boolean {
  return sessionStorage.getItem(ARRIVAL_KEY) !== null;
}

/** One-shot check for the arrival flag set by beginLandingTransition. */
export function consumeLandingArrival(): boolean {
  const arrived = hasLandingArrival();
  if (arrived) sessionStorage.removeItem(ARRIVAL_KEY);
  return arrived;
}

export function beginStudyTransition(
  rect: DOMRect,
  appearance: Appearance & { paper: string },
  navigate: () => void,
  cancel?: () => void,
): void {
  if (getMotionMultiplier() === 0) {
    navigate();
    return;
  }
  sessionStorage.setItem(ARRIVAL_KEY, 'study');
  window.dispatchEvent(
    new CustomEvent(BEGIN_EVENT, { detail: { rect, ...appearance, navigate, cancel } }),
  );
}

export function releaseStudyCover(): void {
  if (sessionStorage.getItem(ARRIVAL_KEY) !== 'study') return;
  sessionStorage.removeItem(ARRIVAL_KEY);
  window.dispatchEvent(new Event(RELEASE_EVENT));
}

interface Transition extends Appearance {
  paper?: string;
  navigate?: () => void;
  cancel?: () => void;
  id: number;
  rect: DOMRect;
  covered: boolean;
  revealing: boolean;
}

export function LandingTransition() {
  const [transition, setTransition] = useState<Transition | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const onBegin = (event: Event) => {
      setTransition({
        ...(event as CustomEvent<Omit<Transition, 'covered' | 'revealing' | 'id'>>).detail,
        covered: false,
        revealing: false,
        id: ++generation.current,
      });
    };
    const release = () =>
      setTransition((current) => (current ? { ...current, revealing: true } : null));
    window.addEventListener(BEGIN_EVENT, onBegin);
    window.addEventListener(RELEASE_EVENT, release);
    return () => {
      window.removeEventListener(BEGIN_EVENT, onBegin);
      window.removeEventListener(RELEASE_EVENT, release);
    };
  }, []);

  const cancel = useCallback(() => {
    if (!transition?.cancel) return;
    generation.current++;
    sessionStorage.removeItem(ARRIVAL_KEY);
    setTransition(null);
    // A mounted study owner clears its own identity and returns through its history.
    // Before that owner mounts, return to the source to abort the pending route load.
    const exit = new Event(STUDY_EXIT_EVENT, { cancelable: true });
    if (window.dispatchEvent(exit)) transition.cancel();
  }, [transition]);
  useEffect(() => {
    if (!transition?.cancel) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      cancel();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [transition, cancel]);

  if (!transition) return null;
  const { rect, covered, revealing, colour, radius, paper, navigate, id } = transition;
  const multiplier = getMotionMultiplier();
  const landingReveal = covered && !paper;
  const identity = 'translate3d(0, 0, 0) scale(1, 1)';
  const initialTransform = paper
    ? `translate3d(${rect.left}px, ${rect.top}px, 0) scale(${rect.width / innerWidth}, ${rect.height / innerHeight})`
    : identity;
  const coverTransform = paper
    ? identity
    : `translate3d(${-rect.left}px, ${-rect.top}px, 0) scale(${innerWidth / rect.width}, ${innerHeight / rect.height})`;
  // Counter-scale the viewport surface's corners to match the source preview.
  const initialRadius = paper
    ? `${(parseFloat(radius) * 100) / rect.width}% / ${(parseFloat(radius) * 100) / rect.height}%`
    : radius;

  return (
    <div
      className="fixed inset-0 z-[100]"
      data-landing-transition
      data-testid={paper ? 'study-cover' : undefined}
      role="presentation"
      style={{ pointerEvents: revealing ? 'none' : undefined }}
    >
      {paper && transition.cancel && (
        <motion.header
          className="absolute inset-x-0 top-0 z-10 pt-[env(safe-area-inset-top)]"
          inert={revealing}
          initial={{ opacity: 0 }}
          animate={{ opacity: covered ? 1 : 0 }}
          transition={{ duration: 0.18 * multiplier, ease: SWEEP_EASE }}
        >
          <div className={STUDY_HEADER_ROW}>
            <Button
              variant="secondary"
              size="sm"
              onClick={cancel}
              className="h-11 shrink-0 px-4 max-md:w-11 max-md:px-0"
            >
              <CloseIcon width={16} height={16} aria-hidden="true" />
              <span className="max-md:sr-only">Exit</span>
            </Button>
          </div>
        </motion.header>
      )}
      <motion.div
        key={landingReveal ? 'reveal' : 'cover'}
        className={
          paper ? 'flow-surface absolute inset-0' : covered ? 'absolute inset-0' : 'absolute'
        }
        style={{
          backgroundColor: colour,
          willChange: 'transform',
          transformOrigin: landingReveal ? undefined : '0 0',
          ...(!paper && !covered
            ? {
                borderRadius: radius,
                height: rect.height,
                left: rect.left,
                top: rect.top,
                width: rect.width,
              }
            : {}),
        }}
        initial={
          landingReveal
            ? { transform: 'translateY(0%)' }
            : { transform: initialTransform, borderRadius: initialRadius }
        }
        animate={
          landingReveal
            ? { transform: 'translateY(-100%)' }
            : {
                transform: coverTransform,
                borderRadius: paper ? '0% / 0%' : '0px',
                backgroundColor: paper ?? colour,
                opacity: revealing ? 0 : 1,
              }
        }
        transition={
          landingReveal
            ? { duration: 0.24 * multiplier, ease: REVEAL_EASE }
            : {
                transform: paper
                  ? { type: 'spring', duration: 0.38 * multiplier, bounce: 0 }
                  : { duration: 0.24 * multiplier, ease: SWEEP_EASE },
                backgroundColor: { duration: 0.38 * multiplier, ease: 'linear' },
                borderRadius: { duration: (paper ? 0.38 : 0.08) * multiplier, ease: SWEEP_EASE },
                opacity: { duration: 0.18 * multiplier, ease: REVEAL_EASE },
              }
        }
        onAnimationComplete={() => {
          if (id !== generation.current) return;
          if (revealing || landingReveal) {
            setTransition(null);
          } else if (!covered) {
            if (navigate) navigate();
            else window.dispatchEvent(new CustomEvent(COVERED_EVENT));
            setTransition((current) => (current ? { ...current, covered: true } : null));
          }
        }}
      />
    </div>
  );
}
