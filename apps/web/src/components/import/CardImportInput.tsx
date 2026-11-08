import { fieldLabelClassName, inputFrameClassName } from '../ui/Field';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { useRef, useState } from 'react';
import { FORMAT_LABELS, type ImportFormat } from '../../db/importEngine';
import { ChevronDownIcon, FileTextIcon, UploadIcon } from '../ui/icons';
import type { useCardImportSource } from './useCardImportSource';
import { countOf } from '../../utils/plural';

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
      data-package-empty={preferPackage && !source.apkg && !source.text}
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
        <label htmlFor="card-import-text" className={fieldLabelClassName}>
          {preferPackage ? 'Anki package' : 'Paste'}
        </label>
        <Button
          type="button"
          variant="secondary"
          onClick={() => fileRef.current?.click()}
          disabled={source.reading}
        >
          <UploadIcon width={16} height={16} />
          Upload
        </Button>
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
          <span className="card-import-package-icon" aria-hidden="true">
            <FileTextIcon width={24} height={24} />
          </span>
          <strong>{source.filename}</strong>
          <p>Includes scheduling history and media.</p>
          <button type="button" onClick={() => source.changeText('')}>
            Use text instead
          </button>
        </div>
      ) : preferPackage && !source.text ? (
        <div className="card-import-package">
          <span className="card-import-package-icon" aria-hidden="true">
            <UploadIcon width={24} height={24} />
          </span>
          <strong>Drop an Anki package here</strong>
          <p>Import cards with their media and scheduling history.</p>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={source.reading}>
            Choose Anki package
          </button>
        </div>
      ) : (
        <textarea
          className={inputFrameClassName}
          id="card-import-text"
          aria-label="Paste your cards"
          value={source.text}
          onChange={(event) => source.changeText(event.target.value)}
          spellCheck={false}
          disabled={source.reading}
        />
      )}
      <div className="card-import-input-tools">
        <div className="card-import-source-meta" role="status">
          <span>
            {source.reading
              ? 'Reading…'
              : countOf(source.apkg?.cards.length ?? source.result.cards.length, 'card')}
          </span>
        </div>
        {!source.apkg && !preferPackage && (
          <details>
            <summary>
              Format <ChevronDownIcon width={14} height={14} />
            </summary>
            <label>
              <span className="sr-only">Format</span>
              <Select
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
              </Select>
            </label>
            <p>One row per card: front, back, optional tags.</p>
          </details>
        )}
      </div>
    </div>
  );
}
