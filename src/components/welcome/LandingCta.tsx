import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getMotionMultiplier } from '../../state/motionSpeed';
import { beginLandingTransition, COVERED_EVENT } from '../layout/LandingTransition';
import './LandingCta.css';

/** Keep the label visible on hover, then expand from the link's actual bounds.
 * Navigation happens under the cover; reduced motion retains ordinary navigation. */
export function LandingCta({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  const ref = useRef<HTMLAnchorElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const onCovered = () => {
      if (started.current) navigate('/');
    };
    window.addEventListener(COVERED_EVENT, onCovered);
    return () => window.removeEventListener(COVERED_EVENT, onCovered);
  }, [navigate]);

  return (
    <Link
      to="/"
      ref={ref}
      className={`landing-cta ${className}`}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
          return;
        if (getMotionMultiplier() === 0 || !ref.current) return;
        event.preventDefault();
        if (started.current) return;
        started.current = true;
        const style = getComputedStyle(ref.current);
        const rect = ref.current.getBoundingClientRect();
        beginLandingTransition(rect, {
          colour: style.backgroundColor,
          // CSS clamps a pill's radius to half its height; preserve that physical radius as it grows.
          radius: `${Math.min(parseFloat(style.borderRadius), rect.height / 2, rect.width / 2)}px`,
        });
      }}
    >
      <span className="landing-cta-label">{children}</span>
      <span className="landing-cta-arrow" aria-hidden="true">
        <svg width="22" height="16" viewBox="0 0 22 16" fill="none">
          <path
            d="M1 8h19M14 2l6 6-6 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </Link>
  );
}
