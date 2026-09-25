import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CardImportPreview } from './CardImportPreview';
import type { ParsedCard } from '../../db/import';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 0,
}));
vi.mock('../../db/assetCache', () => ({
  resolveAssetMarkdownCached: vi.fn(() => {
    throw new Error('Preview must not read persisted assets');
  }),
}));

afterEach(() => vi.restoreAllMocks());

it('renders package images and sound through the real card renderer and releases preview URLs', async () => {
  let nextUrl = 0;
  const create = vi
    .spyOn(URL, 'createObjectURL')
    .mockImplementation(() => `blob:preview-${++nextUrl}`);
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const cards: ParsedCard[] = [
    { type: 'front_back', front: '<img src="diagram.png">', back: '[sound:voice.mp3]' },
  ];
  const media = new Map([
    ['diagram.png', new Uint8Array([1])],
    ['voice.mp3', new Uint8Array([2])],
  ]);
  const { container, unmount } = render(
    <StrictMode>
      <CardImportPreview cards={cards} reverse={false} media={media} />
    </StrictMode>,
  );
  await waitFor(() =>
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('blob:preview-'),
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  await waitFor(() =>
    expect(container.querySelector('audio')).toHaveAttribute(
      'src',
      expect.stringContaining('blob:preview-'),
    ),
  );
  expect(container.querySelector('audio')).toHaveAttribute('controls');
  expect(cards[0].front).toBe('<img src="diagram.png">');
  expect(cards[0].back).toBe('[sound:voice.mp3]');
  expect(create.mock.calls.map(([blob]) => (blob as Blob).type)).toEqual([
    'image/png',
    'audio/mpeg',
    'image/png',
    'audio/mpeg',
  ]);
  unmount();
  expect(revoke.mock.calls.map(([url]) => url).sort()).toEqual(
    create.mock.results.map(({ value }) => value).sort(),
  );
});

it('releases the previous package when the preview source changes', async () => {
  let nextUrl = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:replacement-${++nextUrl}`);
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const cards: ParsedCard[] = [
    { type: 'front_back', front: '![diagram](diagram.png)', back: 'Answer' },
  ];
  const first = new Map([['diagram.png', new Uint8Array([1])]]);
  const second = new Map([['diagram.png', new Uint8Array([2])]]);
  const { container, rerender, unmount } = render(
    <CardImportPreview cards={cards} reverse={false} media={first} />,
  );
  await waitFor(() =>
    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:replacement-1'),
  );
  rerender(<CardImportPreview cards={cards} reverse={false} media={second} />);
  await waitFor(() =>
    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:replacement-2'),
  );
  expect(revoke).toHaveBeenCalledWith('blob:replacement-1');
  expect(revoke).not.toHaveBeenCalledWith('blob:replacement-2');
  unmount();
  expect(revoke).toHaveBeenCalledWith('blob:replacement-2');
});
