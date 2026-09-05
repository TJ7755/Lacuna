import { cn } from './cn';

/** Loose ink strokes shared with the landing page's course and recall illustrations. */
const drawings = {
  course:
    'M8 9 L39 6 L43 47 L12 50 Z M17 20 L31 18 M18 28 L32 26 M48 30 L77 33 L74 72 L45 69 Z M54 43 L68 44 M53 52 L67 53 M28 57 C27 71 34 76 40 75',
  recall: 'M21 25 C33 8 65 9 73 31 C84 61 46 82 26 62 M10 29 L23 28 L24 14 M34 45 L43 54 L60 35',
} as const;

export function StudyDrawing({
  kind,
  className,
}: {
  kind: keyof typeof drawings;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 88 82"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn('h-20 w-20 text-accent', className)}
    >
      <path d={drawings[kind]} />
    </svg>
  );
}
