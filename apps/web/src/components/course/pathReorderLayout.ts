export type PathRowSlot = DOMRect & { marginTop?: number; marginBottom?: number };

export function capturePathSlots(elements: Map<string, HTMLButtonElement>) {
  return new Map<string, PathRowSlot>(
    [...elements].map(([id, button]) => {
      const row = button.closest('li') ?? button;
      const rect = row.getBoundingClientRect();
      const style = getComputedStyle(row);
      return [
        id,
        Object.assign(rect, {
          marginTop: parseFloat(style.marginTop) || 0,
          marginBottom: parseFloat(style.marginBottom) || 0,
        }),
      ];
    }),
  );
}

/** Lay out the preview using each row's own height, rather than swapping unequal slots. */
export function projectPathSlots(
  orderedIds: string[],
  nextIds: string[],
  slots: Map<string, PathRowSlot>,
) {
  const first = slots.get(orderedIds[0]);
  const result = new Map<string, number>();
  if (!first) return result;
  const gaps = orderedIds.slice(1).flatMap((id, index) => {
    const previous = slots.get(orderedIds[index]);
    const current = slots.get(id);
    return previous && current
      ? [
          Math.max(
            0,
            current.top -
              previous.bottom -
              Math.max(previous.marginBottom ?? 0, current.marginTop ?? 0),
          ),
        ]
      : [];
  });
  const gap = gaps.length ? Math.min(...gaps) : 0;
  let top = first.top - (first.marginTop ?? 0);
  let previousMargin = 0;
  for (const id of nextIds) {
    const slot = slots.get(id);
    if (!slot) continue;
    top += Math.max(previousMargin, slot.marginTop ?? 0);
    result.set(id, top);
    top += slot.height + gap;
    previousMargin = slot.marginBottom ?? 0;
  }
  return result;
}
