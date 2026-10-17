import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { animationFinished, morphKeyframes } from '../ui/morphReveal';

export const STUDY_READY_EVENT = 'lacuna:study-reveal';
export const STUDY_REVEALED_EVENT = 'lacuna:study-revealed';

/** Keep the course visible while the destination prepares underneath the growing cover. */
export function StudyLaunchCover({
  rect,
  colour,
  paper,
  radius,
  navigate,
  multiplier,
  onComplete,
}: {
  rect: DOMRect;
  colour: string;
  paper: string;
  radius: string;
  navigate: () => void;
  multiplier: number;
  onComplete: () => void;
}) {
  const backdrop = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const blend = useRef<HTMLDivElement>(null);
  const initial = useRef({ rect, colour, paper, radius, navigate, multiplier, onComplete });
  useLayoutEffect(() => {
    const { rect, navigate, multiplier, onComplete, radius } = initial.current;
    sessionStorage.setItem('lacuna.landingArrival', 'study');
    const cover = surface.current!;
    const paperLayer = blend.current!;
    const background = backdrop.current!;
    const root = document.getElementById('root');
    if (root) {
      const snapshot = root.cloneNode(true) as HTMLElement;
      snapshot.removeAttribute('id');
      snapshot.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
      snapshot.querySelectorAll('[data-landing-transition]').forEach((node) => node.remove());
      background.append(snapshot);
    }
    const bounds = { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const reveal = morphKeyframes(rect, bounds, true, multiplier, undefined, 0, parseFloat(radius));
    const preview = document.querySelector('[data-expanding-action="study"]');
    const previewCopy = preview?.cloneNode(true) as HTMLElement | undefined;
    if (previewCopy) {
      previewCopy.removeAttribute('data-expanding-action');
      Object.assign(previewCopy.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        opacity: '1',
        clipPath: 'none',
      });
      cover.append(previewCopy);
    }
    const previewFade = previewCopy?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 80 * multiplier,
      fill: 'both',
    });
    if (previewFade) animationFinished(previewFade);
    const growth = cover.animate(reveal.frames, { duration: reveal.duration, fill: 'both' });
    const colourBlend = paperLayer.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 300 * multiplier,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'both',
    });
    const dim = background.animate([{ opacity: 1 }, { opacity: 0.975 }], {
      duration: 300 * multiplier,
      fill: 'both',
    });
    [growth, colourBlend, dim].forEach((animation) => animationFinished(animation));
    let ready = false;
    let expanded = false;
    let disposed = false;
    let fade: Animation | undefined;
    const fades: Animation[] = [];
    const revealSession = () => {
      if (!ready || !expanded || disposed || fade) return;
      sessionStorage.removeItem('lacuna.landingArrival');
      window.dispatchEvent(new Event(STUDY_REVEALED_EVENT));
      const backgroundFade = background.animate([{ opacity: 0.975 }, { opacity: 0 }], { duration: 140 * multiplier, fill: 'both' });
      animationFinished(backgroundFade);
      fades.push(backgroundFade);
      fade = cover.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 140 * multiplier,
        fill: 'both',
      });
      animationFinished(fade, onComplete);
    };
    const onReady = (event: Event) => {
      event.preventDefault();
      ready = true;
      revealSession();
    };
    window.addEventListener(STUDY_READY_EVENT, onReady);
    // Begin the entrance during the final approach, never after a full-screen dwell.
    const handoff = window.setTimeout(() => {
      expanded = true;
      revealSession();
    }, 240 * multiplier);
    const navigation = requestAnimationFrame(() => {
      if (!disposed) navigate();
    });
    return () => {
      disposed = true;
      if (sessionStorage.getItem('lacuna.landingArrival') === 'study')
        sessionStorage.removeItem('lacuna.landingArrival');
      cancelAnimationFrame(navigation);
      clearTimeout(handoff);
      window.removeEventListener(STUDY_READY_EVENT, onReady);
      [growth, colourBlend, dim, fade, previewFade, ...fades].forEach((animation) => animation?.cancel());
      background.replaceChildren();
      previewCopy?.remove();
    };
  }, []);
  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[100]"
      data-landing-transition
      data-testid="study-cover"
      role="presentation"
      aria-hidden="true"
    >
      <div ref={backdrop} className="absolute inset-0 overflow-hidden bg-paper" inert />
      <div
        ref={surface}
        className="absolute inset-0"
        style={{ backgroundColor: colour, willChange: 'clip-path, opacity' }}
      >
        <div
          ref={blend}
          className="absolute inset-0"
          style={{ backgroundColor: paper, opacity: 0 }}
        />
      </div>
    </div>,
    document.body,
  );
}
