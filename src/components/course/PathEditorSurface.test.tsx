import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { domAnimation, LazyMotion } from 'motion/react';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { PathEditorSurface } from './PathEditorSurface';

// Use Motion's JS engine; Happy DOM rejects cancelled native animations.
const animateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
beforeAll(() => {
  Reflect.deleteProperty(Element.prototype, 'animate');
});
afterAll(() => {
  if (animateDescriptor) Object.defineProperty(Element.prototype, 'animate', animateDescriptor);
});

function renderEditor(children = <Harness />) {
  return render(<LazyMotion features={domAnimation}>{children}</LazyMotion>);
}

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
it('grows from the focused row, isolates the page and folds back after saving', async () => {
  renderEditor();
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
  expect(screen.getByRole('dialog')).toHaveStyle({ width: '500px', height: '64px' });
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryAllByRole('dialog', { hidden: true })).toHaveLength(0));
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
  renderEditor();
  fireEvent.click(screen.getByRole('button', { name: 'Open row' }));
  expect(screen.getByRole('dialog', { name: 'Edit checkpoint' })).toBeVisible();
  await waitFor(
    () => expect(screen.getByRole('dialog')).toHaveStyle({ width: '520px', borderRadius: '24px' }),
    { timeout: 100 },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryAllByRole('dialog', { hidden: true })).toHaveLength(0));
});

it('focuses the neighbouring row when deletion removes the opening row', async () => {
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
  renderEditor(<DeletionHarness />);
  const opener = screen.getByRole('button', { name: 'Checkpoint row' });
  opener.focus();
  fireEvent.click(opener);
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  fireEvent.click(screen.getByRole('dialog', { name: 'Delete' }).querySelector('button')!);
  await waitFor(() => expect(screen.queryAllByRole('dialog', { hidden: true })).toHaveLength(0));
  expect(screen.getByRole('button', { name: 'Next row' })).toHaveFocus();
});

it('grows the surface itself from the anchor dimensions without a pre-sized backing', async () => {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(260);
  renderEditor();
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
  const surface = screen.getByRole('dialog', { name: 'Edit checkpoint' });
  expect(surface).toHaveStyle({ left: '80px', top: '150px', width: '500px', height: '64px' });
  expect(surface.style.clipPath).toBe('');
  expect(surface).toHaveClass('overflow-hidden', 'path-editor-shadow');
  expect(surface.querySelector('.path-editor-content')).toHaveStyle({ width: '520px' });
  await waitFor(() => expect(surface).toHaveStyle({ width: '520px', height: '260px' }));
  expect(
    document.querySelector(
      '[data-path-editor-host] > .path-editor-shadow:not([data-path-editor-surface])',
    ),
  ).toBeNull();
});
