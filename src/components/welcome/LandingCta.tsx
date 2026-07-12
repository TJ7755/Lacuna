import { useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMotionMultiplier } from '../../state/motionSpeed';
import {
  beginLandingTransition,
  COVERED_EVENT,
} from '../layout/LandingTransition';

/**
 * The landing page's accent call-to-action. Hovering swaps the label for a
 * thin right arrow; clicking hands the button's rect to LandingTransition,
 * which grows it over the viewport before the dashboard is revealed —
 * navigation happens once the overlay reports the screen is covered. Under
 * reduced motion the button simply navigates.
 */
export function LandingCta({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const ref = useRef<HTMLButtonElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const onCovered = () => {
      if (started.current) navigate('/');
    };
    window.addEventListener(COVERED_EVENT, onCovered);
    return () => window.removeEventListener(COVERED_EVENT, onCovered);
  }, [navigate]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => {
        if (started.current) return;
        if (getMotionMultiplier() === 0 || !ref.current) {
          navigate('/');
          return;
        }
        started.current = true;
        beginLandingTransition(ref.current.getBoundingClientRect());
      }}
      className="group/cta shadow-paper shadow-paper-hover relative inline-flex min-h-16 items-center rounded-[10px] bg-accent px-9 text-base font-medium text-accent-fg"
    >
      <span className="transition-[opacity,transform] duration-200 ease-out group-hover/cta:-translate-y-1.5 group-hover/cta:opacity-0 group-focus-visible/cta:-translate-y-1.5 group-focus-visible/cta:opacity-0 motion-reduce:transition-none motion-reduce:group-hover/cta:translate-y-0 motion-reduce:group-hover/cta:opacity-100">
        {children}
      </span>
      <span
        className="absolute inset-0 grid translate-y-1.5 place-items-center opacity-0 transition-[opacity,transform] duration-200 ease-out group-hover/cta:translate-y-0 group-hover/cta:opacity-100 group-focus-visible/cta:translate-y-0 group-focus-visible/cta:opacity-100 motion-reduce:hidden"
        aria-hidden="true"
      >
        <svg width="38" height="12" viewBox="0 0 38 12" fill="none">
          <path
            d="M0 6h35M31 1l5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  );
}
