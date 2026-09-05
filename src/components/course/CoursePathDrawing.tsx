import type { PathNode } from '../../course/path';
import { cn } from '../ui/cn';

const scenes = [
  // An open notebook; its loose underline follows the direction of the path.
  'M20 31 Q48 22 75 36 Q101 22 128 29 L131 91 Q102 84 76 99 Q48 86 22 95 Z M75 36 L76 99 M31 44 Q49 39 63 46 M32 55 Q48 50 61 57 M89 44 L116 39 M89 56 L113 52 M89 68 L108 64 M15 111 Q73 117 139 107',
  // Recall cards and a pencil, drawn as one small study scene.
  'M27 22 L93 16 L101 88 L33 94 Z M41 39 L78 35 M42 51 L70 48 M46 78 L54 84 L70 64 M88 105 L129 46 L137 53 L98 112 L86 118 Z M122 55 L131 62 M15 123 Q78 127 142 116',
  // A reading lamp over a book: the pool of light is left open rather than filled.
  'M31 97 L48 55 L74 28 M63 17 L87 33 L99 20 Q81 1 63 17 Z M25 99 L48 98 M17 107 L60 105 M70 88 Q85 80 101 87 Q115 77 134 82 L135 110 Q118 105 103 117 Q86 108 69 116 Z M101 87 L103 117 M82 52 L89 67 M103 40 L116 56',
] as const;

export function CoursePathDrawing({ node, index }: { node: PathNode; index: number }) {
  if (node.nodeType !== 'lesson' || index % 2 !== 0 || index >= scenes.length * 2) return null;
  const side = Math.floor(index / 2) % 2 === 0 ? 'left' : 'right';
  return (
    <svg
      data-path-drawing={side}
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 160 140"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        'pointer-events-none absolute top-4 w-[calc(50%-5rem)] max-w-40',
        side === 'left' ? 'right-[calc(50%+5rem)] -rotate-6' : 'left-[calc(50%+5rem)] rotate-6',
        node.status === 'completed' ? 'text-accent/70' : 'text-ink-faint/65',
      )}
    >
      <path d={scenes[Math.floor(index / 2) % scenes.length]} />
    </svg>
  );
}
