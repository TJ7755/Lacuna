import { useEffect, useRef, useState } from 'react';
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
}

export function LandingTransition() {
  const [transition, setTransition] = useState<Transition | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const onBegin = (event: Event) => {
      setTransition({
        ...(event as CustomEvent<Omit<Transition, 'covered' | 'id'>>).detail,
        covered: false,
        id: ++generation.current,
      });
    };
    const release = () => setTransition(null);
    window.addEventListener(BEGIN_EVENT, onBegin);
    window.addEventListener(RELEASE_EVENT, release);
    return () => {
      window.removeEventListener(BEGIN_EVENT, onBegin);
      window.removeEventListener(RELEASE_EVENT, release);
    };
  }, []);

  const cancel = () => {
    if (!transition?.cancel) return;
    generation.current++;
    sessionStorage.removeItem(ARRIVAL_KEY);
    setTransition(null);
    transition.cancel();
  };
  useEffect(() => {
    if (!transition?.cancel) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      generation.current++;
      sessionStorage.removeItem(ARRIVAL_KEY);
      setTransition(null);
      transition.cancel?.();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [transition]);

  if (!transition) return null;
  const { rect, covered, colour, radius, paper, navigate, id } = transition;
  const multiplier = getMotionMultiplier();
  const coverTransform = `translate3d(${-rect.left}px, ${-rect.top}px, 0) scale(${innerWidth / rect.width}, ${innerHeight / rect.height})`;

  return (
    <div
      className="fixed inset-0 z-[100]"
      data-landing-transition
      data-testid={paper ? 'study-cover' : undefined}
      role="presentation"
    >
      {paper && transition.cancel && (
        <header className="absolute inset-x-0 top-0 z-10 bg-paper pt-[env(safe-area-inset-top)]">
          <div className={STUDY_HEADER_ROW}>
            <Button variant="secondary" size="sm" onClick={cancel} className="h-11 shrink-0 px-4">
              <CloseIcon width={16} height={16} aria-hidden="true" />
              Exit
            </Button>
          </div>
        </header>
      )}
      {paper && (
        <motion.div
          className="absolute inset-0 bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.04 }}
          transition={{ duration: 0.38 * multiplier }}
        />
      )}
      <motion.div
        key={covered && !paper ? 'reveal' : 'cover'}
        className={covered && !paper ? 'absolute inset-0' : 'absolute'}
        style={
          covered && !paper
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
          covered && !paper
            ? { transform: 'translateY(0%)' }
            : { transform: 'translate3d(0, 0, 0) scale(1, 1)', borderRadius: radius }
        }
        animate={
          covered && !paper
            ? { transform: 'translateY(-100%)' }
            : { transform: coverTransform, borderRadius: '0px', backgroundColor: paper ?? colour }
        }
        transition={
          covered && !paper
            ? { duration: 0.24 * multiplier, ease: REVEAL_EASE }
            : {
                transform: paper
                  ? { type: 'spring', duration: 0.38 * multiplier, bounce: 0 }
                  : { duration: 0.24 * multiplier, ease: SWEEP_EASE },
                backgroundColor: { duration: 0.38 * multiplier, ease: 'linear' },
                borderRadius: { duration: (paper ? 0.38 : 0.08) * multiplier, ease: SWEEP_EASE },
              }
        }
        onAnimationComplete={() => {
          if (id !== generation.current) return;
          if (covered) {
            if (!paper) setTransition(null);
          } else {
            if (navigate) navigate();
            else window.dispatchEvent(new CustomEvent(COVERED_EVENT));
            setTransition((current) => (current ? { ...current, covered: true } : null));
          }
        }}
      />
    </div>
  );
}
