import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import './MarkdownImageViewer.css';

export function MarkdownImageViewer({ children }: { children: ReactNode }) {
  const [image, setImage] = useState<{ src: string; alt: string } | null>(null);
  return (
    <div
      onClick={(event) => {
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
      {image &&
        createPortal(<ImageDialog image={image} onClose={() => setImage(null)} />, document.body)}
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
  const trap = useFocusTrap(true, { autoFocusSelector: '[data-image-close]' });
  const [actualSize, setActualSize] = useState(false);
  return (
    <div
      ref={trap}
      role="dialog"
      aria-modal="true"
      aria-label="Image"
      className="markdown-image-dialog"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <ModalBackdrop onClick={onClose} />
      <section className="markdown-image-panel">
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
          <img src={image.src} alt={image.alt} />
        </div>
        {image.alt && <p>{image.alt}</p>}
      </section>
    </div>
  );
}
