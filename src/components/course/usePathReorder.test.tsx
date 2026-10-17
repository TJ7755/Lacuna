import { fireEvent, render, screen } from '@testing-library/react';
import { act, StrictMode, useRef } from 'react';
import type * as React from 'react';
import { domMax, LazyMotion, m } from 'motion/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePathReorder } from './useLessonPathReorder';
const passiveEffects = vi.hoisted(
  () => new Set<{ setup: () => void | (() => void); cleanup: void | (() => void) }>(),
);
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof React>();
  return {
    ...react,
    useEffect: (setup: () => void | (() => void), deps?: React.DependencyList) => {
      react.useEffect(() => {
        const effect = { setup, cleanup: setup() };
        passiveEffects.add(effect);
        return () => {
          passiveEffects.delete(effect);
          effect.cleanup?.();
        };
      }, deps);
    },
  };
});

const persist = vi.fn().mockResolvedValue(undefined);
const items = [
  { id: 'one', name: 'One' },
  { id: 'two', name: 'Two' },
];
function Harness() {
  const reorder = usePathReorder({
    items,
    enabled: true,
    onError: vi.fn(),
    onReorder: persist,
    holdDelay: 350,
  });
  return (
    <>
      {items.map((item) => {
        const row = reorder.interactionFor(item.id);
        return (
          <button
            key={item.id}
            ref={row.registerElement}
            onPointerDown={row.onPointerDown}
            onPointerMove={row.onPointerMove}
            onPointerUp={row.onPointerUp}
            data-lifted={row.lifted || undefined}
          >
            {item.name}
          </button>
        );
      })}
      <output>{reorder.announcement}</output>
    </>
  );
}
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it('requires the hold before lifting, follows the pointer and cancels with Escape', async () => {
  vi.useFakeTimers();
  render(<Harness />);
  const row = screen.getByRole('button', { name: 'One' });
  fireEvent.pointerDown(row, { button: 0, pointerId: 2, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(row, { pointerId: 2, clientX: 10, clientY: 30 });
  expect(row).not.toHaveAttribute('data-lifted');
  await act(async () => vi.advanceTimersByTime(350));
  expect(row).toHaveAttribute('data-lifted', 'true');
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(row).not.toHaveAttribute('data-lifted');
  expect(persist).not.toHaveBeenCalled();
});

function RetainedRefHarness({ rows }: { rows: typeof items }) {
  const reorder = usePathReorder({
    items: rows,
    enabled: true,
    onError: vi.fn(),
    onReorder: persist,
  });
  const refs = useRef(new Map<string, (element: HTMLButtonElement | null) => void>());
  return (
    <>
      {rows.map((item) => {
        const interaction = reorder.interactionFor(item.id);
        if (!refs.current.has(item.id)) refs.current.set(item.id, interaction.registerElement);
        return (
          <button key={item.id} ref={refs.current.get(item.id)}>
            {item.name}
          </button>
        );
      })}
    </>
  );
}
it('uses the current order for touch gestures even when a row retains its original ref', async () => {
  vi.useFakeTimers();
  const { rerender } = render(<RetainedRefHarness rows={items} />);
  rerender(<RetainedRefHarness rows={[items[1], items[0]]} />);
  const row = screen.getByRole('button', { name: 'Two' });
  for (const [index, button] of screen.getAllByRole('button').entries())
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      top: index * 100,
      left: 0,
      width: 400,
      height: 60,
      bottom: index * 100 + 60,
      right: 400,
    } as DOMRect);
  const touch = (y: number) =>
    ({ identifier: 77, target: row, clientX: 10, clientY: y }) as unknown as Touch;
  row.dispatchEvent(
    new TouchEvent('touchstart', {
      bubbles: true,
      touches: [touch(10)],
      changedTouches: [touch(10)],
    }),
  );
  await act(async () => vi.advanceTimersByTime(350));
  await act(async () => {
    row.dispatchEvent(
      new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches: [touch(150)],
        changedTouches: [touch(150)],
      }),
    );
    row.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [touch(150)] }));
  });
  expect(persist).toHaveBeenCalledWith(['one', 'two'], 'two');
});

function MotionHarness({ rows }: { rows: typeof items }) {
  const reorder = usePathReorder({
    items: rows,
    enabled: true,
    onError: vi.fn(),
    onReorder: persist,
    holdDelay: 350,
  });
  return rows.map((item) => {
    const interaction = reorder.interactionFor(item.id);
    return (
      <m.button
        key={item.id}
        ref={interaction.registerElement}
        data-lifted={interaction.lifted || undefined}
      >
        {item.name}
      </m.button>
    );
  });
}

it('retains Motion row touch listeners through effect replay and a saved-data render', async () => {
  vi.useFakeTimers();
  const view = (rows: typeof items) => (
    <StrictMode>
      <LazyMotion features={domMax}>
        <MotionHarness rows={rows} />
      </LazyMotion>
    </StrictMode>
  );
  const { rerender, unmount } = render(view(items));
  const row = screen.getByRole('button', { name: 'One' });
  const add = vi.spyOn(row, 'addEventListener');
  const remove = vi.spyOn(row, 'removeEventListener');
  rerender(view(items.map((item) => ({ ...item, name: `${item.name} saved` }))));
  // Fast Refresh replays effects without detaching Motion's retained DOM refs.
  act(() => {
    const effects = [...passiveEffects];
    for (const effect of effects) effect.cleanup?.();
    for (const effect of effects) effect.cleanup = effect.setup();
  });
  expect(screen.getByRole('button', { name: 'One saved' })).toBe(row);
  for (const [index, button] of screen.getAllByRole('button').entries())
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      top: index * 100,
      left: 0,
      width: 400,
      height: 60,
      bottom: index * 100 + 60,
      right: 400,
    } as DOMRect);
  const touch = (y: number) =>
    ({ identifier: 78, target: row, clientX: 10, clientY: y }) as unknown as Touch;
  act(() => {
    row.dispatchEvent(
      new TouchEvent('touchstart', {
        bubbles: true,
        touches: [touch(10)],
        changedTouches: [touch(10)],
      }),
    );
  });
  await act(async () => vi.advanceTimersByTime(350));
  expect(row).toHaveAttribute('data-lifted', 'true');
  await act(async () => {
    row.dispatchEvent(
      new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches: [touch(150)],
        changedTouches: [touch(150)],
      }),
    );
    row.dispatchEvent(
      new TouchEvent('touchend', { bubbles: true, cancelable: true, changedTouches: [touch(150)] }),
    );
  });
  expect(persist).toHaveBeenCalledWith(['two', 'one'], 'one');
  expect(add.mock.calls.filter(([name]) => name.startsWith('touch'))).toHaveLength(0);
  expect(remove.mock.calls.filter(([name]) => name.startsWith('touch'))).toHaveLength(0);
  unmount();
  expect(remove.mock.calls.filter(([name]) => name.startsWith('touch'))).toHaveLength(4);
});
