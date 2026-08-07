import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioCardEditor } from './AudioCardEditor';
import { storeAudioBlob } from '../../db/assets';

vi.mock('../../db/assets', async () => {
  const actual = (await vi.importActual('../../db/assets')) as Record<string, unknown>;
  return {
    ...actual,
    storeAudioBlob: vi.fn().mockResolvedValue({ hash: 'b'.repeat(64), kind: 'audio' }),
  };
});

vi.mock('../../db/assetCache', () => ({
  resolveAssetUrl: vi.fn().mockResolvedValue('blob:preview'),
}));

describe('AudioCardEditor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores a selected file and writes the ordinary front/back storage shape', async () => {
    const onFrontChange = vi.fn();
    render(
      <AudioCardEditor
        front="Listen and translate:"
        back="Answer"
        onFrontChange={onFrontChange}
        onBackChange={vi.fn()}
        onError={vi.fn()}
      />,
    );

    const file = new File(['clip'], 'clip.mp3', { type: 'audio/mpeg' });
    fireEvent.change(screen.getByLabelText('Choose file'), { target: { files: [file] } });

    await waitFor(() => expect(storeAudioBlob).toHaveBeenCalledWith(file, 'audio/mpeg'));
    expect(onFrontChange).toHaveBeenCalledWith(
      `Listen and translate:\n\n![audio](lacuna-asset://${'b'.repeat(64)})`,
    );
  });

  it('keeps the prompt editable after an asset has been selected', async () => {
    const hash = 'a'.repeat(64);
    const onFrontChange = vi.fn();
    render(
      <AudioCardEditor
        front={`Old prompt\n\n![audio](lacuna-asset://${hash})`}
        back="Answer"
        onFrontChange={onFrontChange}
        onBackChange={vi.fn()}
        onError={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Listen and translate:'), {
      target: { value: 'New prompt' },
    });
    expect(onFrontChange).toHaveBeenCalledWith(`New prompt\n\n![audio](lacuna-asset://${hash})`);
    await waitFor(() => expect(screen.getByText('Replace')).toBeInTheDocument());
  });

  it('starts only one microphone request while permission is pending', async () => {
    let grantPermission: ((stream: MediaStream) => void) | undefined;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          grantPermission = resolve;
        }),
    );
    class FakeMediaRecorder {
      static isTypeSupported() {
        return true;
      }
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {}
      stop() {}
    }
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    render(
      <AudioCardEditor
        front=""
        back="Answer"
        onFrontChange={vi.fn()}
        onBackChange={vi.fn()}
        onError={vi.fn()}
      />,
    );

    const record = screen.getByRole('button', { name: 'Record' });
    fireEvent.click(record);
    fireEvent.click(record);

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Starting…' })).toBeDisabled();

    grantPermission?.({ getTracks: () => [] } as unknown as MediaStream);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Stop recording' })).toBeEnabled(),
    );
  });
});
