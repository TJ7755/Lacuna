import { useRef, useState } from 'react';
import { exportQuestionBank, importQuestionBank } from '../../questions/bank';
import { Button } from '../ui/Button';
import { DownloadIcon, UploadIcon } from '../ui/icons';

export function QuestionBankControls({
  courseId,
  bankIds,
  disabled,
}: {
  courseId: string;
  bankIds: string[];
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [retainedFile, setRetainedFile] = useState<File | null>(null);
  const importFile = async (file: File) => {
    setBusy(true);
    setError('');
    setMessage('');
    setRetainedFile(file);
    try {
      const sets = await importQuestionBank(JSON.parse(await file.text()), courseId);
      setMessage(`Imported ${sets.length} question sets. Saved attempts are retained.`);
      setRetainedFile(null);
      if (input.current) input.current.value = '';
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not import this bank.');
    } finally {
      setBusy(false);
    }
  };
  const exportBank = async (bankId: string) => {
    setBusy(true);
    setError('');
    try {
      const bank = await exportQuestionBank(courseId, bankId);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(bank, null, 2)], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${bankId}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not export this bank.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Question banks" className="ml-auto min-w-0 max-w-full" aria-busy={busy}>
      <div className="flex min-h-12 flex-wrap items-center gap-2">
        <Button variant="ghost" disabled={disabled || busy} onClick={() => input.current?.click()}>
          <UploadIcon width={16} height={16} />
          {busy ? 'Working…' : 'Import question bank'}
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          aria-label="Question bank JSON"
          className="hidden"
          disabled={disabled || busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
          }}
        />
        {bankIds.map((id) => (
          <Button
            key={id}
            variant="ghost"
            disabled={disabled || busy}
            onClick={() => void exportBank(id)}
          >
            <DownloadIcon width={16} height={16} />
            Export {id}
          </Button>
        ))}
      </div>
      {message && (
        <p role="status" className="mt-2 text-sm text-ink-soft">
          {message}
        </p>
      )}
      {error && (
        <div className="mt-3 min-w-0">
          <p role="alert" className="qs-error">
            Could not import or export this bank.{' '}
            {retainedFile
              ? `${retainedFile.name} is retained. Saved content and attempts are unchanged.`
              : ''}
          </p>
          <details className="text-sm">
            <summary>Validation details</summary>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words">{error}</pre>
          </details>
          {retainedFile && (
            <Button
              className="mt-2"
              disabled={disabled || busy}
              onClick={() => void importFile(retainedFile)}
            >
              Retry import
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
