import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { PathEditorSurface } from './PathEditorSurface';

function Harness() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('Checkpoint');
  return (
    <>
      <button onClick={() => setOpen(true)}>Open row</button>
      {open && (
        <PathEditorSurface
          label="Edit checkpoint"
          onSave={() => !!name.trim()}
          onClosed={() => setOpen(false)}
        >
          <input
            aria-label="Name"
            data-path-editor-focus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </PathEditorSurface>
      )}
    </>
  );
}
afterEach(() => vi.restoreAllMocks());
it('blooms from the focused row, isolates the page and folds back after saving', async () => {
  const reveals: Keyframe[][] = [];
  vi.spyOn(Element.prototype, 'animate').mockImplementation(function (this: Element, frames) {
    if (this.hasAttribute('data-path-editor-surface')) reveals.push(frames as Keyframe[]);
    return { cancel: vi.fn(), finished: Promise.resolve(), currentTime: 0 } as unknown as Animation;
  });
  render(<Harness />);
  const row = screen.getByRole('button', { name: 'Open row' });
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
    left: 80,
    top: 150,
    width: 500,
    height: 64,
    right: 580,
    bottom: 214,
  } as DOMRect);
  row.focus();
  fireEvent.click(row);
  expect(screen.getByRole('dialog', { name: 'Edit checkpoint' })).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  expect(row.closest('[inert]')).not.toBeNull();
  expect(reveals.some((frames) => frames[0].clipPath !== frames.at(-1)?.clipPath)).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(row.closest('[inert]')).toBeNull();
  expect(row).toHaveFocus();
});

it('opens and folds instantly when reduced motion sets the multiplier to zero', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  const animate = vi.spyOn(Element.prototype, 'animate');
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Open row' }));
  expect(screen.getByRole('dialog', { name: 'Edit checkpoint' })).toBeVisible();
  expect(
    animate.mock.calls.some((_, index) =>
      (animate.mock.contexts[index] as Element)?.hasAttribute('data-path-editor-surface'),
    ),
  ).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('focuses the neighbouring row when deletion removes the opening row', async () => {
  vi.spyOn(Element.prototype, 'animate').mockImplementation(
    () =>
      ({ cancel: vi.fn(), finished: Promise.resolve(), currentTime: 0 }) as unknown as Animation,
  );
  function DeletionHarness() {
    const [exists, setExists] = useState(true);
    const [open, setOpen] = useState(false);
    return (
      <>
        <ol>
          <li>{exists && <button onClick={() => setOpen(true)}>Checkpoint row</button>}</li>
          <li>
            <button data-path-row>Next row</button>
          </li>
        </ol>
        {open && (
          <PathEditorSurface
            label="Edit checkpoint"
            onSave={() => true}
            onDelete={async () => {
              setExists(false);
              return true;
            }}
            deleteNoun="checkpoint"
            onClosed={() => setOpen(false)}
          >
            <input aria-label="Name" data-path-editor-focus />
          </PathEditorSurface>
        )}
      </>
    );
  }
  render(<DeletionHarness />);
  const opener = screen.getByRole('button', { name: 'Checkpoint row' });
  opener.focus();
  fireEvent.click(opener);
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  fireEvent.click(screen.getByRole('dialog', { name: 'Delete' }).querySelector('button')!);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Next row' })).toHaveFocus();
});
