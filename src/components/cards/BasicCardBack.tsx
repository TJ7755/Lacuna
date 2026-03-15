import { MarkdownPreview } from './MarkdownPreview';
import styles from './CardFace.module.css';

interface BasicCardBackProps {
  back: string;
  className?: string;
}

/** Renders the back face of a basic card. Handles empty content gracefully. */
export function BasicCardBack({ back, className }: BasicCardBackProps) {
  if (!back.trim()) {
    return <span className={styles.empty}>—</span>;
  }
  return (
    <MarkdownPreview
      content={back}
      className={`${styles.face} ${className ?? ''}`}
    />
  );
}
