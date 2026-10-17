import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Carry presented row positions across the repository's DOM reorder before settling. */
export function usePathDropTransition(
  order: string,
  elements: RefObject<Map<string, HTMLButtonElement>>,
  onReconciled: () => void,
) {
  const release = useRef<{ order: string; positions: Map<string, number> } | null>(null);
  const complete = useRef(onReconciled);
  complete.current = onReconciled;
  const [offsets, setOffsets] = useState<Map<string, number> | null>(null);
  const [velocity, setVelocity] = useState<{ id: string; value: number } | null>(null);
  const [instant, setInstant] = useState(false);
  useLayoutEffect(() => {
    const captured = release.current;
    if (!captured || captured.order === order) return;
    release.current = null;
    const next = new Map<string, number>();
    for (const [id, button] of elements.current) {
      const row = button.closest('li') ?? button;
      const before = captured.positions.get(id);
      if (before === undefined) continue;
      const rect = row.getBoundingClientRect();
      const transform = getComputedStyle(row).transform;
      const translation =
        transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).m42 : 0;
      const layoutTop = rect.top - translation + (rect.height - row.offsetHeight) / 2;
      next.set(id, before - layoutTop);
    }
    setInstant(true);
    setOffsets(next);
    complete.current();
    // Publish the compensated positions before starting the settle spring.
    const frame = requestAnimationFrame(() => {
      setInstant(false);
      setOffsets(new Map([...next.keys()].map((id) => [id, 0])));
    });
    return () => cancelAnimationFrame(frame);
  }, [order, elements]);
  return {
    offsets,
    instant,
    velocityFor(id: string) {
      return offsets && !instant && velocity?.id === id ? velocity.value : 0;
    },
    capture(id: string, value = 0) {
      setVelocity({ id, value: Math.max(-1200, Math.min(1200, value)) });
      release.current = {
        order,
        positions: new Map(
          [...elements.current].map(([id, button]) => [
            id,
            (button.closest('li') ?? button).getBoundingClientRect().top,
          ]),
        ),
      };
    },
    reset() {
      release.current = null;
      setOffsets(null);
      setInstant(false);
    },
  };
}
