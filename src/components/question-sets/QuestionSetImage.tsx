import { useState } from 'react';
import type { QuestionSetDraftSession } from '../../questions/questionSetDraftSession';
import { Button } from '../ui/Button';

export function QuestionSetImage({
  session,
  nodeId,
}: {
  session: QuestionSetDraftSession;
  nodeId: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <details className="qs-image-form">
      <summary>Add a diagram or image</summary>
      <label className="qs-field">
        Image
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <label className="qs-field">
        Image description
        <input
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          placeholder="Describe the information shown in the diagram"
        />
      </label>
      <p className="qs-muted">
        The description is available to screen readers. Add a caption beneath the image in the
        question text.
      </p>
      {error && (
        <p role="alert" className="qs-error">
          {error}
        </p>
      )}
      <Button
        variant="secondary"
        disabled={!file || !alt.trim() || busy}
        onClick={async () => {
          if (!file) return;
          setBusy(true);
          setError('');
          try {
            await session.insertImage(nodeId, file, alt);
            setFile(null);
            setAlt('');
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not add this image.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Adding image…' : 'Add image'}
      </Button>
    </details>
  );
}
