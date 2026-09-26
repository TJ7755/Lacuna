import { useEffect, useRef, useState } from 'react';
import type { QuestionSetDraftSession } from '../../questions/questionSetDraftSession';
import { Button } from '../ui/Button';

export function QuestionSetImage({
  session,
  nodeId,
}: {
  session: QuestionSetDraftSession;
  nodeId: string;
}) {
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
    setError('');
    if (inputRef.current) inputRef.current.value = '';
    requestAnimationFrame(() => chooserRef.current?.focus());
  }
  return (
    <details className="qs-image-form">
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
          setFile(next);
          setError('');
        }}
      />
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
              value={alt}
              disabled={busy}
              onChange={(event) => setAlt(event.target.value)}
              placeholder="Describe what the diagram shows"
            />
          </label>
          <p className="qs-muted">Describe the information a learner needs from this image.</p>
          <Button
            className="mt-4"
            variant="primary"
            disabled={!alt.trim() || busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await session.insertImage(nodeId, file, alt);
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
  );
}
