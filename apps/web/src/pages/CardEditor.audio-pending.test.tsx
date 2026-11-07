import {
  chooseType,
  editorState,
  generatedCard,
  renderEditing,
  updateCard,
} from './CardEditor.testSupport';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { MediaAsset } from '@lacuna/core/db/types';
import { storeAudioBlob } from '../db/assets';
import type * as AssetsModule from '../db/assets';
import type * as AssetCacheModule from '../db/assetCache';

vi.mock('../db/assets', async () => ({
  ...(await vi.importActual<typeof AssetsModule>('../db/assets')),
  storeAudioBlob: vi.fn(),
}));

vi.mock('../db/assetCache', async () => ({
  ...(await vi.importActual<typeof AssetCacheModule>('../db/assetCache')),
  resolveAssetUrl: vi.fn().mockResolvedValue('blob:audio'),
}));

it('blocks both Save and keyboard submission until a replacement clip reaches the card', async () => {
  const oldHash = 'a'.repeat(64);
  const newHash = 'b'.repeat(64);
  editorState.card = {
    ...generatedCard,
    sequenceItemId: undefined,
    front: `Listen\n\n![audio](lacuna-asset://${oldHash})`,
    back: 'A tone',
  };
  let finish: ((asset: MediaAsset) => void) | undefined;
  vi.mocked(storeAudioBlob).mockImplementationOnce(
    () =>
      new Promise<MediaAsset>((resolve) => {
        finish = resolve;
      }),
  );
  renderEditing();
  const save = screen.getByRole('button', { name: 'Save changes' });
  expect(save).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Replace'), {
    target: { files: [new File(['replacement'], 'new.wav', { type: 'audio/wav' })] },
  });
  expect(save).toBeDisabled();
  await act(async () => {
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Answer' }), {
      key: 'Enter',
      ctrlKey: true,
    });
  });
  expect(updateCard).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Prompt (optional)' }), {
    target: { value: 'Identify this sound' },
  });
  await act(async () =>
    finish?.({
      hash: newHash,
      kind: 'audio',
      blob: new Uint8Array([1]),
      mimeType: 'audio/wav',
      createdAt: 0,
    }),
  );
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
  await waitFor(() => expect(updateCard).toHaveBeenCalled());
  expect(updateCard).toHaveBeenCalledWith(
    'card-1',
    expect.objectContaining({
      front: `Identify this sound\n\n![audio](lacuna-asset://${newHash})`,
    }),
  );
});

it('releases Save when the author switches away from a pending audio upload', async () => {
  const oldFront = `Listen\n\n![audio](lacuna-asset://${'a'.repeat(64)})`;
  editorState.card = {
    ...generatedCard,
    sequenceItemId: undefined,
    front: oldFront,
    back: 'A tone',
  };
  vi.mocked(storeAudioBlob).mockImplementationOnce(() => new Promise(() => {}));
  renderEditing();
  fireEvent.change(screen.getByLabelText('Replace'), {
    target: { files: [new File(['clip'], 'clip.wav', { type: 'audio/wav' })] },
  });
  const save = screen.getByRole('button', { name: 'Save changes' });
  expect(save).toBeDisabled();
  chooseType('Front / back');
  await waitFor(() => expect(save).toBeEnabled());
  expect(screen.getByPlaceholderText(/Question or prompt/)).toHaveValue(oldFront);
});
