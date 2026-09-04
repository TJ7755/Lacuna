import { useEffect, useRef, useState } from 'react';
import './ProductWalkthrough.css';

const scenes = [
  {
    title: 'See what needs your time.',
    text: 'Your courses and the week’s revision, together in one place.',
    image: 'study-plan.png',
    drawing:
      'M53 9 C28 6 13 23 15 45 C17 67 36 77 55 70 C76 63 80 40 68 23 C64 17 59 12 53 9 M46 20 L45 42 L60 51 M39 2 L53 2',
  },
  {
    title: 'Follow your subject.',
    text: 'Move through lessons with notes, cards and practice along the way.',
    image: 'course-path.png',
    drawing:
      'M8 9 L39 6 L43 47 L12 50 Z M17 20 L31 18 M18 28 L32 26 M48 30 L77 33 L74 72 L45 69 Z M54 43 L68 44 M53 52 L67 53 M28 57 C27 71 34 76 40 75',
  },
  {
    title: 'Bring the answer back.',
    text: 'One question at a time. Try to recall it, then reveal the answer.',
    image: 'revision.png',
    drawing: 'M21 25 C33 8 65 9 73 31 C84 61 46 82 26 62 M10 29 L23 28 L24 14 M34 45 L43 54 L60 35',
  },
];

export function ProductWalkthrough() {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const media = window.matchMedia(
      '(min-width: 801px) and (prefers-reduced-motion: no-preference)',
    );
    const steps = Array.from(section.querySelectorAll<HTMLElement>('.walkthrough-step'));
    const images = Array.from(section.querySelectorAll<HTMLImageElement>('.walkthrough-frame img'));
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!media.matches) return;
      const centres = steps.map((step) => {
        const rect = step.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
      const middle = window.innerHeight / 2;
      let position = 0;
      for (let index = 0; index < centres.length - 1; index++) {
        if (middle >= centres[index]) {
          position =
            index + Math.min(1, (middle - centres[index]) / (centres[index + 1] - centres[index]));
        }
      }
      // Hold each screen while its copy is read; blend only around the handover.
      const base = Math.floor(position);
      const blend = Math.min(1, Math.max(0, (position - base - 0.3) / 0.4));
      const eased = blend * blend * (3 - 2 * blend);
      images.forEach((image, index) => {
        const weight = index === base ? 1 - eased : index === base + 1 ? eased : 0;
        image.style.opacity = String(weight);
        image.style.transform = `scale(${1 + (1 - weight) * 0.035})`;
        image.style.filter = `blur(${(1 - weight) * 4}px)`;
      });
      setActive(Math.round(position));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
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
    <section className="landing-walkthrough" ref={ref} aria-label="Inside Lacuna">
      <div className="walkthrough-frame">
        {scenes.map((scene, index) => (
          <img
            key={scene.image}
            src={`${import.meta.env.BASE_URL}landing/${scene.image}`}
            alt={scene.title}
            width="1280"
            height="800"
            data-active={index === active}
            aria-hidden={index !== active}
            decoding="async"
          />
        ))}
      </div>
      <div className="walkthrough-steps">
        {scenes.map((scene) => (
          <article className="walkthrough-step" key={scene.image}>
            <img
              className="walkthrough-inline"
              src={`${import.meta.env.BASE_URL}landing/${scene.image}`}
              alt={scene.title}
              width="1280"
              height="800"
              decoding="async"
            />
            <div className="walkthrough-copy">
              <svg
                className="walkthrough-drawing"
                viewBox="0 0 88 82"
                aria-hidden="true"
                fill="none"
              >
                <path d={scene.drawing} />
              </svg>
              <h3>{scene.title}</h3>
              <p>{scene.text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
