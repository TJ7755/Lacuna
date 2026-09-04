import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MoneyIllustration } from './MoneyIllustration';
import './ClosingScenes.css';

function ClosingScene({
  title,
  id,
  drawings,
  children,
}: {
  title: string;
  id: string;
  drawings: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const paint = () => {
      frame = 0;
      if (media.matches) {
        section.style.setProperty('--drift', '0');
        return;
      }
      const rect = section.getBoundingClientRect();
      const drift = Math.max(
        -1,
        Math.min(1, (innerHeight / 2 - rect.top - rect.height / 2) / innerHeight),
      );
      section.style.setProperty('--drift', String(drift));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    media.addEventListener('change', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      media.removeEventListener('change', schedule);
    };
  }, []);
  return (
    <section ref={ref} className="closing-scene" aria-labelledby={id}>
      <div className="closing-stage">
        <div className="closing-drawings" aria-hidden="true">
          {drawings}
        </div>
        <div className="closing-copy">
          <h2 id={id}>{title}</h2>
          {children}
        </div>
      </div>
    </section>
  );
}

function DeviceIllustration() {
  return (
    <div className="device-illustration">
      <svg className="closing-left" viewBox="0 0 180 145" fill="none">
        <path d="M25 22 L150 18 L153 105 L24 107 Z M35 32 L139 29 L142 94 L34 97 Z M24 107 L9 124 Q87 136 168 121 L153 105 M69 118 L107 117" />
        <path className="closing-amber" d="M74 63 L86 75 L110 48" />
        <path d="M11 40 L3 35 M160 11 L166 4" opacity=".5" />
      </svg>
      <svg className="closing-right" viewBox="0 0 180 145" fill="none">
        <path d="M19 44 L21 118 L152 124 L160 58 L85 54" />
        <path d="M19 44 L58 41 L74 54 L160 58 M21 118 L32 65 L160 58 M42 53 L44 24 L119 29 L121 54" />
        <path
          className="closing-amber"
          d="M55 36 L91 39 M54 44 L78 46 M77 85 L107 86 L107 107 L76 106 Z M83 85 L83 78 C83 67 101 67 101 79 L101 86"
        />
        <path d="M158 36 L166 29 M166 86 L175 89" opacity=".5" />
      </svg>
    </div>
  );
}

export function ClosingScenes() {
  return (
    <>
      <ClosingScene id="landing-freedom-title" title="£0 forever." drawings={<MoneyIllustration />}>
        <a href="https://github.com/TJ7755/Lacuna" target="_blank" rel="noreferrer">
          Free and open source.
        </a>
      </ClosingScene>
      <ClosingScene
        id="landing-device-title"
        title="Your study data stays on your device."
        drawings={<DeviceIllustration />}
      >
        <Link to="/share?intent=import">Import a shared course</Link>
      </ClosingScene>
    </>
  );
}
