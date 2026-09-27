import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { QuestionSetDraftSession } from '../../questions/questionSetDraftSession';
import { Button } from '../ui/Button';

export function QuestionSetImage({
  session,
  nodeId,
  children,
}: {
  session: QuestionSetDraftSession;
  nodeId: string;
  children?: ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const chooserRef = useRef<HTMLButtonElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [alt, setAlt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function clear() {
    setFile(null);
    setAlt('');
    setCaption('');
    setError('');
    if (inputRef.current) inputRef.current.value = '';
    requestAnimationFrame(() => chooserRef.current?.focus());
  }
  function receive(files: FileList | File[]) {
    const images = Array.from(files).filter((candidate) => candidate.type.startsWith('image/'));
    if (!images.length) return false;
    if (busy) return true;
    if (detailsRef.current) detailsRef.current.open = true;
    if (images.length > 1) {
      setError('Add one image at a time.');
      return true;
    }
    setFile(images[0]);
    setError('');
    requestAnimationFrame(() => descriptionRef.current?.focus());
    return true;
  }
  return (
    <div
      onPasteCapture={(event) => {
        if (receive(event.clipboardData.files)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDragOverCapture={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault();
      }}
      onDropCapture={(event) => {
        if (event.dataTransfer.files.length) {
          event.preventDefault();
          event.stopPropagation();
          if (!receive(event.dataTransfer.files)) {
            if (detailsRef.current) detailsRef.current.open = true;
            setError('Choose an image file.');
          }
        }
      }}
    >
      {children}
      <details ref={detailsRef} className="qs-image-form">
        <summary>Add a diagram or image</summary>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          aria-label="Image file"
          disabled={busy}
          onChange={(event) => {
            const next = event.target.files?.[0];
            if (!next) return;
            if (!receive([next])) setError('Choose an image file.');
          }}
        />
        <p className="qs-muted">Choose, paste or drop an image.</p>
        <div className="qs-image-choice">
          {file && preview && (
            <img className="qs-image-thumb" src={preview} alt="Selected image preview" />
          )}
          <div className="qs-image-choice-info">
            {file && <p className="qs-image-filename">{file.name}</p>}
            <div className="qs-actions">
              <Button
                ref={chooserRef}
                variant="secondary"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                {file ? 'Change image' : 'Choose image'}
              </Button>
              {file && (
                <Button variant="ghost" disabled={busy} onClick={clear}>
                  Remove selection
                </Button>
              )}
            </div>
          </div>
        </div>
        {file && (
          <>
            <label className="qs-field">
              Image description
              <input
                ref={descriptionRef}
                value={alt}
                disabled={busy}
                onChange={(event) => setAlt(event.target.value)}
                placeholder="Describe what the diagram shows"
              />
            </label>
            <p className="qs-muted">Describe the information a learner needs from this image.</p>
            <label className="qs-field mt-4">
              Caption (optional)
              <input
                value={caption}
                disabled={busy}
                onChange={(event) => setCaption(event.target.value)}
              />
            </label>
            <Button
              className="mt-4"
              variant="primary"
              disabled={!alt.trim() || busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  if (caption.trim()) await session.insertImage(nodeId, file, alt, caption);
                  else await session.insertImage(nodeId, file, alt);
                  clear();
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : 'Could not add this image.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Adding image…' : 'Add image'}
            </Button>
          </>
        )}
        {error && (
          <p role="alert" className="qs-error">
            {error}
          </p>
        )}
      </details>
    </div>
  );
}
