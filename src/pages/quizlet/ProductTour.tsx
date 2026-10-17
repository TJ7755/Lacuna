import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'motion/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { DialogPanel } from '../../components/ui/DialogPanel';
import { Button } from '../../components/ui/Button';
import { SECTION_CARD_SURFACE_CLASS } from '../../components/ui/SectionCard';
import { StepSwap } from '../../components/ui/StepSwap';
import course from './captures/course.png';
import lesson from './captures/lesson.png';
import recall from './captures/recall.png';
import settings from './captures/settings.png';
import { Arrow } from './ComparisonUi';

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
  const [open, setOpen] = useState(false);
  const trapRef = useFocusTrap(open);
  return (
    <figure
      className={`${SECTION_CARD_SURFACE_CLASS} qc-product-screen ${compact ? 'qc-screen-compact' : ''}`}
    >
      <div className="qc-window-bar">
        <span>
          <i />
          <i />
          <i />
        </span>
        <Button
          variant="ghost"
          onClick={(event) => {
            event.currentTarget.focus();
            setOpen(true);
          }}
          aria-label={`Enlarge ${item.label.toLowerCase()} screenshot`}
        >
          Expand <Arrow />
        </Button>
      </div>
      <button
        className="qc-screen-image"
        onClick={(event) => {
          event.currentTarget.focus();
          setOpen(true);
        }}
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
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <DialogPanel
                label={item.label}
                trapRef={trapRef}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpen(false);
                  }
                }}
                onBackdropClick={() => setOpen(false)}
                overlayClassName="p-4"
                className="max-w-[1400px] max-h-[calc(100dvh-2rem)]"
              >
                <div className="flex shrink-0 justify-end border-b border-line px-6 py-4">
                  <Button
                    variant="ghost"
                    onClick={() => setOpen(false)}
                    aria-label="Close screenshot"
                  >
                    Close ×
                  </Button>
                </div>
                <div className="min-h-0 overflow-auto p-5 sm:p-6">
                  <img className="h-auto w-full" src={item.image} alt={item.alt} />
                </div>
              </DialogPanel>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </figure>
  );
}
export function ProductTour({ initial = 'course' }: { initial?: ScreenKey }) {
  const [active, setActive] = useState<ScreenKey>(initial);
  return (
    <div className="qc-tour">
      <div className="qc-tour-tabs" aria-label="Explore Lacuna screens">
        {screens.map((item) => (
          <Button
            variant={active === item.key ? 'inverse' : 'secondary'}
            key={item.key}
            aria-pressed={active === item.key}
            onClick={() => setActive(item.key)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <StepSwap stepKey={active}>
        <ProductScreen screen={active} />
      </StepSwap>
    </div>
  );
}
