import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m as motion, useIsPresent } from 'motion/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { Button } from '../ui/Button';
import { DialogPanel } from '../ui/DialogPanel';
import { scaledSpring } from '../ui/motion';
import './MarkdownImageViewer.css';

export function MarkdownImageViewer({ children }: { children: ReactNode }) {
  const [image, setImage] = useState<{ src: string; alt: string } | null>(null);
  return (
    <div
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('.markdown-image-dialog')) {
          event.stopPropagation();
          return;
        }
        const trigger = (event.target as HTMLElement).closest<HTMLButtonElement>(
          'button[data-enlarge-image]',
        );
        const selected = trigger?.querySelector('img');
        if (!selected?.src) return;
        event.preventDefault();
        event.stopPropagation();
        trigger!.focus();
        setImage({ src: selected.currentSrc || selected.src, alt: selected.alt });
      }}
    >
      {children}
      {createPortal(
        <AnimatePresence>
          {image && <ImageDialog image={image} onClose={() => setImage(null)} />}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

function ImageDialog({
  image,
  onClose,
}: {
  image: { src: string; alt: string };
  onClose: () => void;
}) {
  const present = useIsPresent();
  const trap = useFocusTrap(present, { autoFocusSelector: '[data-image-close]' });
  const [actualSize, setActualSize] = useState(false);
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  return (
    <DialogPanel
      label="Image"
      trapRef={trap}
      overlayClassName="markdown-image-dialog"
      className="markdown-image-panel"
      onBackdropClick={onClose}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <header>
        <Button
          variant="ghost"
          onClick={() => setActualSize(!actualSize)}
          aria-pressed={actualSize}
        >
          {actualSize ? 'Fit image' : 'Actual size'}
        </Button>
        <Button variant="ghost" data-image-close onClick={onClose}>
          Close image
        </Button>
      </header>
      <div
        className="markdown-image-canvas"
        data-actual-size={actualSize}
        tabIndex={0}
        aria-label="Diagram"
      >
        <motion.img
          src={image.src}
          alt={image.alt}
          layout={multiplier > 0}
          transition={scaledSpring(multiplier, 320, 30)}
        />
      </div>
    </DialogPanel>
  );
}
