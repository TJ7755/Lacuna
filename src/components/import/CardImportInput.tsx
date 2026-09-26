import { useRef, useState } from 'react';
import { FORMAT_LABELS, type ImportFormat } from '../../db/importEngine';
import type { useCardImportSource } from './useCardImportSource';

export function CardImportInput({
  source,
  preferPackage = false,
}: {
  source: ReturnType<typeof useCardImportSource>;
  preferPackage?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className="card-import-input"
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
        void source.readFile(event.dataTransfer.files[0]);
      }}
    >
      <div className="card-import-input-label">
        <label htmlFor="card-import-text">
          {preferPackage ? 'Anki package' : 'Paste your cards'}
        </label>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={source.reading}>
          Upload a file <span aria-hidden="true">↗</span>
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        aria-label="Upload cards"
        hidden
        accept={preferPackage ? '.apkg' : '.csv,.tsv,.txt,.json,.md,.markdown,.html,.xml,.apkg'}
        onChange={(event) => {
          void source.readFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {source.apkg ? (
        <div className="card-import-package">
          <strong>{source.filename}</strong>
          <p>{source.apkg.cards.length} cards · Anki package</p>
          <p>Includes scheduling history and media.</p>
          <button type="button" onClick={() => source.changeText('')}>
            Use text instead
          </button>
        </div>
      ) : preferPackage && !source.text ? (
        <div className="card-import-package">
          <strong>Drop an Anki package here</strong>
          <p>Import cards with their media and scheduling history.</p>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={source.reading}>
            Choose Anki package
          </button>
        </div>
      ) : (
        <textarea
          id="card-import-text"
          value={source.text}
          onChange={(event) => source.changeText(event.target.value)}
          spellCheck={false}
          disabled={source.reading}
        />
      )}
      <div className="card-import-source-meta" role="status">
        <span>
          {source.reading
            ? 'Reading file…'
            : `${source.apkg?.cards.length ?? source.result.cards.length} cards detected`}
        </span>
        <span>
          {source.apkg
            ? 'APKG'
            : source.format
              ? FORMAT_LABELS[source.format]
              : source.text
                ? FORMAT_LABELS[source.detected]
                : 'Text, CSV, JSON or Anki'}
        </span>
      </div>
      {!source.apkg && !preferPackage && (
        <details>
          <summary>Import settings</summary>
          <label>
            Format
            <select
              value={source.format}
              onChange={(event) => source.setFormat(event.target.value as ImportFormat | '')}
            >
              <option value="">Automatic</option>
              {(
                ['csv', 'tsv', 'markdown-table', 'markdown-list', 'json', 'plain-text'] as const
              ).map((format) => (
                <option key={format} value={format}>
                  {FORMAT_LABELS[format]}
                </option>
              ))}
            </select>
          </label>
          <p>Use one row per card: front, back, then optional tags.</p>
        </details>
      )}
    </div>
  );
}
