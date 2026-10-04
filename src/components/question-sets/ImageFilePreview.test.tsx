import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ImageFilePreview } from './ImageFilePreview';

afterEach(() => vi.unstubAllGlobals());

it('draws the chosen file onto a labelled canvas without an object URL', async () => {
  const close = vi.fn();
  const bitmap = { width: 1280, height: 640, close };
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  const createObjectURL = vi.spyOn(URL, 'createObjectURL');

  render(<ImageFilePreview file={new File(['x'], 'diagram.png', { type: 'image/png' })} />);

  const preview = screen.getByRole('img', { name: 'Selected image preview' });
  await waitFor(() => expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 320, 160));
  expect(preview).toHaveProperty('width', 320);
  expect(preview).toHaveProperty('height', 160);
  expect(close).toHaveBeenCalled();
  expect(createObjectURL).not.toHaveBeenCalled();
});
