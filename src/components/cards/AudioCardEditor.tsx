import { useEffect, useRef, useState } from 'react';
import { MAX_AUDIO_BYTES, storeAudioBlob } from '../../db/assets';
import { resolveAssetUrl } from '../../db/assetCache';
import { buildAudioCardFront, parseAudioCardFront } from '../../media/audio';
import { Button } from '../ui/Button';
import { PauseIcon, UploadIcon } from '../ui/icons';

const AUDIO_ACCEPT =
  '.mp3,.m4a,.mp4,.ogg,.wav,.webm,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm';

function recordingMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return (
    ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((type) =>
      MediaRecorder.isTypeSupported(type),
    ) ?? null
  );
}

export function AudioCardEditor({
  front,
  back,
  onFrontChange,
  onBackChange,
  onError,
}: {
  front: string;
  back: string;
  onFrontChange: (front: string) => void;
  onBackChange: (back: string) => void;
  onError: (message: string) => void;
}) {
  const parsed = parseAudioCardFront(front);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!parsed?.assetHash) {
      setPreviewUrl(null);
      return () => {};
    }
    void resolveAssetUrl(parsed.assetHash).then((url) => {
      if (!cancelled) setPreviewUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [parsed?.assetHash]);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const store = async (blob: Blob, mimeType: string) => {
    setBusy(true);
    try {
      const asset = await storeAudioBlob(blob, mimeType);
      onFrontChange(buildAudioCardFront(parsed?.prompt ?? front.trim(), asset.hash));
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not store that audio file.');
    } finally {
      setBusy(false);
    }
  };

  const chooseFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_AUDIO_BYTES) {
      onError('Audio files must be 25 MB or smaller.');
      return;
    }
    void store(file, file.type);
  };

  const stopRecording = () => recorderRef.current?.stop();

  const startRecording = async () => {
    const mimeType = recordingMimeType();
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
      onError('Audio recording is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      streamRef.current = stream;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        void store(new Blob(chunksRef.current, { type: mimeType }), mimeType);
      };
      recorder.start();
      setRecording(true);
    } catch {
      onError('Microphone access was not granted.');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-faint">Audio</div>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4">
          {previewUrl ? (
            <audio className="min-w-0 flex-1" src={previewUrl} controls preload="metadata" />
          ) : (
            <span className="min-w-0 flex-1 text-sm text-ink-soft">
              Choose or record an audio clip.
            </span>
          )}
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ink-soft transition-colors hover:border-line-strong hover:text-ink">
            <UploadIcon width={16} height={16} />
            {parsed ? 'Replace' : 'Choose file'}
            <input
              type="file"
              accept={AUDIO_ACCEPT}
              className="sr-only"
              disabled={busy || recording}
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
          </label>
          <Button
            type="button"
            variant={recording ? 'primary' : 'secondary'}
            disabled={busy}
            onClick={() => (recording ? stopRecording() : void startRecording())}
          >
            {recording && <PauseIcon width={15} height={15} />}
            {recording ? 'Stop recording' : 'Record'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          MP3, M4A, MP4, Ogg, WAV or WebM; 25 MB maximum.
        </p>
      </div>

      <label>
        <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-ink-faint">
          Prompt (optional)
        </span>
        <textarea
          value={parsed?.prompt ?? front.replace(/!\[audio\][^\n]*/i, '').trim()}
          onChange={(event) => {
            if (parsed) onFrontChange(buildAudioCardFront(event.target.value, parsed.assetHash));
            else onFrontChange(event.target.value);
          }}
          rows={3}
          placeholder="Listen and translate:"
          className="w-full resize-y rounded-xl border border-line bg-surface px-4 py-3 text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent"
        />
      </label>

      <label>
        <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-ink-faint">
          Answer
        </span>
        <textarea
          value={back}
          onChange={(event) => onBackChange(event.target.value)}
          rows={5}
          placeholder="The expected answer."
          className="w-full resize-y rounded-xl border border-line bg-surface px-4 py-3 text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent"
        />
      </label>
    </div>
  );
}
