import { useRef, useState } from 'react';
import course from './captures/course.png';
import lesson from './captures/lesson.png';
import recall from './captures/recall.png';
import settings from './captures/settings.png';
import { Arrow } from './PrototypeUi';

export const screens = [
  {
    key: 'course',
    label: 'Your course',
    image: course,
    alt: 'Actual Lacuna course view showing the four lessons in Welcome to Lacuna',
  },
  {
    key: 'lesson',
    label: 'Your notes',
    image: lesson,
    alt: 'Actual Lacuna lesson with notes about spaced repetition and its cards',
  },
  {
    key: 'recall',
    label: 'Your practice',
    image: recall,
    alt: 'Actual Lacuna Simple Learn screen showing a card from the built-in example course',
  },
  {
    key: 'settings',
    label: 'Your approach',
    image: settings,
    alt: 'Actual Lacuna course settings, showing course details and study controls',
  },
] as const;
export type ScreenKey = (typeof screens)[number]['key'];

export function ProductScreen({
  screen = 'course',
  compact = false,
}: {
  screen?: ScreenKey;
  compact?: boolean;
}) {
  const item = screens.find((entry) => entry.key === screen) ?? screens[0];
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <figure className={`qc-product-screen ${compact ? 'qc-screen-compact' : ''}`}>
      <div className="qc-window-bar">
        <span>
          <i />
          <i />
          <i />
        </span>
        <button
          onClick={() => dialog.current?.showModal()}
          aria-label={`Enlarge ${item.label.toLowerCase()} screenshot`}
        >
          Expand <Arrow />
        </button>
      </div>
      <button
        className="qc-screen-image"
        onClick={() => dialog.current?.showModal()}
        aria-label={`View ${item.label.toLowerCase()} at full size`}
      >
        <img
          src={item.image}
          alt={item.alt}
          width="2880"
          height="1920"
          loading={screen === 'course' ? 'eager' : 'lazy'}
        />
      </button>
      <dialog
        ref={dialog}
        className="qc-image-dialog"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <button onClick={() => dialog.current?.close()} aria-label="Close screenshot">
          Close ×
        </button>
        <img src={item.image} alt={item.alt} />
      </dialog>
    </figure>
  );
}
export function ProductTour({ initial = 'course' }: { initial?: ScreenKey }) {
  const [active, setActive] = useState<ScreenKey>(initial);
  return (
    <div className="qc-tour">
      <div className="qc-tour-tabs" aria-label="Explore Lacuna screens">
        {screens.map((item) => (
          <button
            key={item.key}
            aria-pressed={active === item.key}
            onClick={() => setActive(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="qc-tour-panel" key={active}>
        <ProductScreen screen={active} />
      </div>
    </div>
  );
}
