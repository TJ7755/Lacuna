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
    title: 'A place for the whole subject.',
    detail: 'Lessons, cards and an assessment date in one course path.',
    alt: 'Actual Lacuna course view showing the four lessons in Welcome to Lacuna',
    points: ['A lesson-by-lesson path', 'Recall material in context', 'Assessments on the horizon'],
  },
  {
    key: 'lesson',
    label: 'Your notes',
    image: lesson,
    title: 'Keep the explanation close.',
    detail: 'Notes sit alongside the lesson’s cards, so there is a route back to the idea.',
    alt: 'Actual Lacuna lesson with notes about spaced repetition and its cards',
    points: ['Notes beside your cards', 'Markdown and maths', 'A focused lesson view'],
  },
  {
    key: 'recall',
    label: 'Your practice',
    image: recall,
    title: 'Give the answer a moment.',
    detail: 'A focused study view helps you recall before you reveal.',
    alt: 'Actual Lacuna Simple Learn screen showing a card from the built-in example course',
    points: ['One prompt at a time', 'Reveal when you are ready', 'Practise without an account'],
  },
  {
    key: 'settings',
    label: 'Your approach',
    image: settings,
    title: 'Study on your terms.',
    detail: 'Adjust the course’s study settings and assessments as your plans change.',
    alt: 'Actual Lacuna course settings, showing course details and study controls',
    points: [
      'Course-level controls',
      'Your choice of study target',
      'No subscription for core revision',
    ],
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
        <span>Lacuna / {item.label}</span>
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
          width="1280"
          height="853"
          loading={screen === 'course' ? 'eager' : 'lazy'}
        />
      </button>
      <figcaption>
        <span className="qc-brand-dot" /> Actual app · built-in example course{' '}
        <span>Captured 27 Sep 2026</span>
      </figcaption>
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
        <p>{item.detail}</p>
      </dialog>
    </figure>
  );
}
export function ProductTour({ initial = 'course' }: { initial?: ScreenKey }) {
  const [active, setActive] = useState<ScreenKey>(initial);
  const current = screens.find((item) => item.key === active) ?? screens[0];
  return (
    <div className="qc-tour">
      <div className="qc-tour-tabs" aria-label="Explore Lacuna screens">
        {screens.map((item, index) => (
          <button
            key={item.key}
            aria-pressed={active === item.key}
            onClick={() => setActive(item.key)}
          >
            <span>0{index + 1}</span>
            {item.label}
          </button>
        ))}
      </div>
      <div className="qc-tour-panel" key={active}>
        <ProductScreen screen={active} />
        <div className="qc-tour-caption">
          <div>
            <h3>{current.title}</h3>
            <p>{current.detail}</p>
          </div>
          <ul>
            {current.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
