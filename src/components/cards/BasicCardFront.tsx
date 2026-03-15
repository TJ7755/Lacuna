import { MarkdownPreview } from './MarkdownPreview';
import styles from './CardFace.module.css';

interface BasicCardFrontProps {
  front: string;
  className?: string;
}

/** Renders the front face of a basic card. Handles empty content gracefully. */
export function BasicCardFront({ front, className }: BasicCardFrontProps) {
  if (!front.trim()) {
    return <span className={styles.empty}>—</span>;
  }
  return (
    <MarkdownPreview
      content={front}
      className={`${styles.face} ${className ?? ''}`}
    />
  );
}
