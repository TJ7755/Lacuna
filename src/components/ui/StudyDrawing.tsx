import { cn } from './cn';

/** Loose ink strokes shared with the landing page's course and recall illustrations. */
const drawings = {
  course:
    'M8 9 L39 6 L43 47 L12 50 Z M17 20 L31 18 M18 28 L32 26 M48 30 L77 33 L74 72 L45 69 Z M54 43 L68 44 M53 52 L67 53 M28 57 C27 71 34 76 40 75',
  activity:
    'M16 23 L35 20 L39 64 L19 68 Z M37 15 L54 17 L53 61 M59 22 L75 27 L69 69 L53 66 M25 33 L30 32 M24 43 L32 42 M62 38 L68 40 M11 76 Q45 81 78 73',
  time: 'M23 11 L65 9 M27 13 C27 32 56 43 61 67 M61 12 C60 35 31 47 29 69 M24 73 L65 71 M36 62 L53 61 L44 49 Z',
  stability:
    'M14 68 Q8 54 31 54 L62 53 Q80 57 72 70 Q47 79 14 68 Z M25 49 Q16 37 34 34 L59 35 Q73 43 61 50 Z M35 28 Q28 12 46 11 Q64 14 55 29 Z',
  accuracy:
    'M67 16 C36 0 9 26 20 54 C29 80 67 77 75 51 M60 30 C44 19 28 32 33 48 C38 63 58 63 63 47 M46 43 L76 14 M66 13 L78 12 L78 24',
  comparison:
    'M10 18 L35 15 L38 66 L13 69 Z M51 14 L76 19 L72 70 L48 65 Z M20 31 L28 30 M20 41 L29 40 M57 31 L68 33 M57 41 L66 43 M35 76 Q44 82 53 76',
  prediction:
    'M15 17 L72 14 L75 70 L18 74 Z M26 7 L27 25 M59 6 L60 23 M16 31 L73 28 M30 55 Q40 38 51 53 Q59 63 65 43 M62 43 L66 41 L68 47',
  leech:
    'M19 12 L65 9 L70 69 L24 74 Z M30 24 L55 22 M31 33 L52 32 M34 55 L43 63 L59 43 M13 57 L7 61 M73 23 L80 19 M71 77 L77 81',
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
