import { useEffect, useState } from 'react';
import { m as motion } from 'motion/react';
import { getMotionMultiplier } from '../../state/motionSpeed';

// Landing → dashboard handover: the clicked CTA's accent panel grows to cover
// the viewport, its arrow stretches into a full-width hairline, and the panel
// splits along that line, the halves parting to reveal the dashboard beneath.
//
// The overlay lives beside the router (not inside a route) so it survives the
// /welcome → / navigation. It is coordinated by events rather than callbacks:
// the CTA calls beginLandingTransition() with its rect; the overlay dispatches
// COVERED_EVENT once the viewport is hidden, at which point the CTA navigates;
// AppShell reads the arrival flag to settle the dashboard up from under-scale.

const BEGIN_EVENT = 'lacuna:landing-transition';
export const COVERED_EVENT = 'lacuna:landing-covered';
const ARRIVAL_KEY = 'lacuna.landingArrival';

/** House ease used across the app's reveals. */
const EASE = [0.16, 1, 0.3, 1] as const;

/** Gentler ease-in-out for the sweep, so the cover never jumps off the mark. */
const SWEEP_EASE = [0.5, 0, 0.15, 1] as const;

export function beginLandingTransition(rect: DOMRect): void {
  sessionStorage.setItem(ARRIVAL_KEY, '1');
  window.dispatchEvent(new CustomEvent(BEGIN_EVENT, { detail: rect }));
}

/** One-shot check for the arrival flag set by beginLandingTransition. */
export function consumeLandingArrival(): boolean {
  const arrived = sessionStorage.getItem(ARRIVAL_KEY) === '1';
  if (arrived) sessionStorage.removeItem(ARRIVAL_KEY);
  return arrived;
}

type Phase = 'sweep' | 'split';

interface Transition {
  rect: DOMRect;
  phase: Phase;
}

export function LandingTransition() {
  const [transition, setTransition] = useState<Transition | null>(null);

  useEffect(() => {
    const onBegin = (e: Event) => {
      setTransition({ rect: (e as CustomEvent<DOMRect>).detail, phase: 'sweep' });
    };
    window.addEventListener(BEGIN_EVENT, onBegin);
    return () => window.removeEventListener(BEGIN_EVENT, onBegin);
  }, []);

  if (!transition) return null;

  const m = getMotionMultiplier();
  const { rect, phase } = transition;
  const splitting = phase === 'split';

  return (
    <div className="fixed inset-0 z-[100]" role="presentation">
      {/* Accent panel: one full-screen rect clipped down to the button while
          covering (clip-path animates on the compositor, so the growth stays
          smooth), then two parting halves once the line has drawn. The swap is
          invisible — same colour, same bounds. */}
      {!splitting ? (
        <motion.div
          initial={{
            clipPath: `inset(${rect.top}px ${window.innerWidth - rect.right}px ${window.innerHeight - rect.bottom}px ${rect.left}px round 10px)`,
          }}
          animate={{
            // Pass through an asymmetric mid-frame — width races ahead of
            // height — so the growth feels dynamic rather than uniform.
            clipPath: [
              null,
              `inset(${rect.top * 0.55}px ${(window.innerWidth - rect.right) * 0.25}px ${(window.innerHeight - rect.bottom) * 0.55}px ${rect.left * 0.25}px round 12px)`,
              'inset(0px 0px 0px 0px round 0px)',
            ],
          }}
          transition={{ duration: 0.5 * m, ease: SWEEP_EASE, times: [0, 0.5, 1] }}
          onAnimationComplete={() => {
            window.dispatchEvent(new CustomEvent(COVERED_EVENT));
          }}
          className="absolute inset-0 bg-accent"
        />
      ) : (
        <>
          <motion.div
            initial={{ y: 0 }}
            animate={{ y: '-100%' }}
            transition={{ duration: 0.7 * m, ease: EASE }}
            onAnimationComplete={() => setTransition(null)}
            className="absolute inset-x-0 top-0 h-1/2 bg-accent"
          >
            <span className="absolute inset-x-0 bottom-0 h-px bg-accent-fg" />
          </motion.div>
          <motion.div
            initial={{ y: 0 }}
            animate={{ y: '100%' }}
            transition={{ duration: 0.7 * m, ease: EASE }}
            className="absolute inset-x-0 bottom-0 h-1/2 bg-accent"
          >
            <span className="absolute inset-x-0 top-0 h-px bg-accent-fg" />
          </motion.div>
        </>
      )}

      {/* The headless arrow shaft: one continuous sweep — it glides from the
          button's centre to the middle of the screen in step with the cover,
          and starts stretching into the full-width hairline before the glide
          has landed, so nothing pauses between movements. */}
      {!splitting && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <motion.span
            initial={{
              width: 26,
              x: rect.left + rect.width / 2 - window.innerWidth / 2,
              y: rect.top + rect.height / 2 - window.innerHeight / 2,
            }}
            animate={{ width: window.innerWidth, x: 0, y: 0 }}
            transition={{
              width: { delay: 0.35 * m, duration: 0.55 * m, ease: EASE },
              x: { duration: 0.5 * m, ease: SWEEP_EASE },
              y: { duration: 0.5 * m, ease: SWEEP_EASE },
            }}
            onAnimationComplete={() => {
              setTransition((t) => (t ? { ...t, phase: 'split' } : t));
            }}
            className="h-px bg-accent-fg"
          />
        </div>
      )}
    </div>
  );
}
