import { renderClozeFront } from '../../lib/cloze';
import { MarkdownPreview } from './MarkdownPreview';
import styles from './CardFace.module.css';

interface ClozeCardFrontProps {
  clozeText: string;
  /** Which deletion index to hide. Defaults to 1. */
  activeIndex?: number;
  className?: string;
}

/**
 * Renders the front face of a cloze card for review.
 * The active deletion is replaced with `[___]` (or the hint if present).
 * All other deletions are visible as plain answer text.
 */
export function ClozeCardFront({
  clozeText,
  activeIndex = 1,
  className,
}: ClozeCardFrontProps) {
  if (!clozeText.trim()) {
    return <span className={styles.empty}>—</span>;
  }
  const rendered = renderClozeFront(clozeText, activeIndex);
  return (
    <MarkdownPreview
      content={rendered}
      className={`${styles.face} ${className ?? ''}`}
    />
  );
}
