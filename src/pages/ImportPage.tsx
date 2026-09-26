import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CardImportDialog } from '../components/import/CardImportDialog';
import { SharedCourseImport } from '../components/import/SharedCourseImport';
import { ImportDestination, useImportDestination } from '../components/import/ImportDestination';
import { importCardsToDestination } from '../db/cardImport';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import {
  UploadIcon,
  CardsIcon,
  FileTextIcon,
  ShareIcon,
  ChevronLeftIcon,
} from '../components/ui/icons';
import './ImportPage.css';

type Source = 'lacuna' | 'anki' | 'text';
const sources = [
  { id: 'lacuna', title: 'Lacuna course', detail: 'File, share code or QR', icon: ShareIcon },
  { id: 'anki', title: 'Anki deck', detail: 'Anki package (.apkg)', icon: CardsIcon },
  { id: 'text', title: 'Text or spreadsheet', detail: 'Paste or upload cards', icon: FileTextIcon },
] as const;

export function ImportPage() {
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [file, setFile] = useState<File>();
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { notify } = useToast();
  const draft = useImportDestination();

  function chooseFile(next: File | undefined) {
    if (!next) return;
    setFile(next);
    setSource(
      /\.lacuna$/i.test(next.name) ? 'lacuna' : /\.apkg$/i.test(next.name) ? 'anki' : 'text',
    );
  }
  function reset() {
    setSource(null);
    setFile(undefined);
  }

  return (
    <div className="import-page mx-auto max-w-6xl px-6 py-10 md:px-10">
      <header className="mb-8">
        <div className="mb-3 flex min-h-11 items-center">
          {source && (
            <button
              type="button"
              disabled={busy}
              onClick={reset}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink active:text-ink disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeftIcon width={16} height={16} />
              Back
            </button>
          )}
        </div>
        <h1 className="font-display text-4xl tracking-tight md:text-5xl">Import</h1>
      </header>
      {!source ? (
        <>
          <div className="import-sources">
            {sources.map(({ id, title, detail, icon: Icon }) => (
              <button key={id} type="button" onClick={() => setSource(id)}>
                <Icon width={24} height={24} />
                <strong>{title}</strong>
                <span>{detail}</span>
              </button>
            ))}
          </div>
          <div
            className="import-drop"
            data-dragging={dragging}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              chooseFile(event.dataTransfer.files[0]);
            }}
          >
            <UploadIcon width={28} height={28} />
            <h2>Drop a file here</h2>
            <p>Lacuna, Anki, CSV, TSV, Markdown, JSON or text</p>
            <input
              ref={input}
              type="file"
              hidden
              aria-label="Import file"
              accept=".lacuna,.apkg,.csv,.tsv,.txt,.json,.md,.markdown"
              onChange={(event) => {
                chooseFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <Button variant="secondary" onClick={() => input.current?.click()}>
              Choose file
            </Button>
          </div>
        </>
      ) : source === 'lacuna' ? (
        <SharedCourseImport
          onBusyChange={setBusy}
          initialFile={file}
          onImported={(id) => void navigate(`/course/${id}`)}
        />
      ) : (
        <CardImportDialog
          presentation="page"
          initialFile={file}
          preferPackage={source === 'anki'}
          onBusyChange={setBusy}
          onCancel={reset}
          schedulingUnitId={
            draft.destination?.kind === 'existing' ? draft.destination.schedulingUnitId : undefined
          }
          reviewOptions={<ImportDestination draft={draft} />}
          canImport={!!draft.destination}
          onImport={async (content) => {
            if (!draft.destination) throw new Error('Choose a destination and study target.');
            const result = await importCardsToDestination(draft.destination, content);
            notify(`${result.count} cards imported.`, 'positive');
            void navigate(
              `/course/${result.courseId}${result.lesson ? `/lesson/${result.lesson.id}` : ''}`,
            );
          }}
        />
      )}
    </div>
  );
}
