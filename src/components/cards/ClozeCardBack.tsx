import { renderClozeBack } from '../../lib/cloze';
import { MarkdownPreview } from './MarkdownPreview';
import styles from './CardFace.module.css';

interface ClozeCardBackProps {
  clozeText: string;
  /** Which deletion index is being revealed (rendered bold). Defaults to 1. */
  activeIndex?: number;
  className?: string;
}

/**
 * Renders the back face of a cloze card for review.
 * The active deletion answer is highlighted in bold (`**answer**`).
 * All other deletions are visible as plain answer text.
 */
export function ClozeCardBack({
  clozeText,
  activeIndex = 1,
  className,
}: ClozeCardBackProps) {
  if (!clozeText.trim()) {
    return <span className={styles.empty}>—</span>;
  }
  const rendered = renderClozeBack(clozeText, activeIndex);
  return (
    <MarkdownPreview
      content={rendered}
      className={`${styles.face} ${className ?? ''}`}
    />
  );
}
