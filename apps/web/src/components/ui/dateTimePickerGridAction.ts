type GridAction = { kind: 'select' | 'move'; index: number };

/** Resolve keys for the three-column month and year grids. */
export function dateTimePickerGridAction(
  index: number,
  count: number,
  key: string,
): GridAction | null {
  let next = index;
  switch (key) {
    case 'ArrowLeft':
      next -= 1;
      break;
    case 'ArrowRight':
      next += 1;
      break;
    case 'ArrowUp':
      next -= 3;
      break;
    case 'ArrowDown':
      next += 3;
      break;
    case 'Enter':
    case ' ':
      return { kind: 'select', index };
    default:
      return null;
  }
  return { kind: 'move', index: Math.max(0, Math.min(count - 1, next)) };
}
