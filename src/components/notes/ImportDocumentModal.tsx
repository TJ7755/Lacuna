import type { Editor } from '@tiptap/react';
import { useMemo, useState } from 'react';
import { importDocx } from '../../lib/documents/importDocx';
import { importPdf } from '../../lib/documents/importPdf';
import { UI } from '../../ui-strings';
import styles from './ImportDocumentModal.module.css';

type ImportMode = 'content' | 'embed';
type ContentMode = 'replace' | 'append';
type SupportedDocumentType = 'pdf' | 'docx';

type TipTapNode = {
  type?: string;
  content?: TipTapNode[];
};

interface ImportDocumentModalProps {
  file: File;
  fileType: SupportedDocumentType;
  currentTitle: string;
  currentContent: object;
  editor: Editor | null;
  onClose: () => void;
  onImportAsContent: (params: {
    title: string;
    content: object;
  }) => Promise<void>;
}

const IMPORT_MAX_SIZE_BYTES = 2 * 1024 * 1024;
const EMBED_MAX_SIZE_BYTES = 5 * 1024 * 1024;

function getTitleFromFileName(fileName: string): string {
  const title = fileName.replace(/\.[^.]+$/, '').trim();
  return title || 'Imported document';
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const value = reader.result;
      if (typeof value === 'string') {
        resolve(value);
        return;
      }

      reject(new Error('Failed to read file'));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

function appendTipTapDoc(baseDoc: object, importedDoc: object): object {
  const base = baseDoc as TipTapNode;
  const incoming = importedDoc as TipTapNode;

  const baseContent = Array.isArray(base.content) ? base.content : [];
  const incomingContent = Array.isArray(incoming.content)
    ? incoming.content
    : [];

  return {
    type: 'doc',
    content: [...baseContent, ...incomingContent],
  };
}

export function ImportDocumentModal({
  file,
  fileType,
  currentTitle,
  currentContent,
  editor,
  onClose,
  onImportAsContent,
}: ImportDocumentModalProps) {
  const [importMode, setImportMode] = useState<ImportMode>('content');
  const [contentMode, setContentMode] = useState<ContentMode>('replace');
  const [title, setTitle] = useState<string>(
    getTitleFromFileName(file.name) || currentTitle,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isImportTooLarge = file.size > IMPORT_MAX_SIZE_BYTES;
  const isEmbedTooLarge = file.size > EMBED_MAX_SIZE_BYTES;

  const resolvedTitle = useMemo(
    () => title.trim() || getTitleFromFileName(file.name),
    [file.name, title],
  );

  const handleConfirm = async () => {
    setError(null);

    if (importMode === 'content') {
      if (isImportTooLarge) {
        setError(UI.notes.importErrorSize);
        return;
      }

      setLoading(true);

      try {
        const imported =
          fileType === 'pdf' ? await importPdf(file) : await importDocx(file);

        const content =
          contentMode === 'replace'
            ? imported.content
            : appendTipTapDoc(currentContent, imported.content);

        await onImportAsContent({
          title: resolvedTitle,
          content,
        });

        onClose();
      } catch {
        setError(UI.common.error);
      } finally {
        setLoading(false);
      }

      return;
    }

    if (isEmbedTooLarge) {
      setError(UI.notes.importEmbedErrorSize);
      return;
    }

    if (!editor) {
      setError(UI.common.error);
      return;
    }

    setLoading(true);

    try {
      const dataUrl = await readAsDataUrl(file);

      editor
        .chain()
        .focus()
        .insertContent({
          type: 'documentEmbed',
          attrs: {
            fileName: file.name,
            fileType,
            dataUrl,
          },
        })
        .run();

      onClose();
    } catch {
      setError(UI.common.error);
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={styles.wrapper}
      role="dialog"
      aria-modal="true"
      onClick={handleBackdropClick}
    >
      <div className={styles.backdrop} />
      <section className={styles.modal}>
        <header className={styles.header}>
          <h2 className={styles.title}>{UI.notes.importDocument}</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
          >
            {UI.common.close}
          </button>
        </header>

        <div className={styles.optionRow}>
          <button
            type="button"
            className={
              importMode === 'content'
                ? styles.optionButtonActive
                : styles.optionButton
            }
            onClick={() => setImportMode('content')}
          >
            {UI.notes.importAsNoteContent}
          </button>
          <button
            type="button"
            className={
              importMode === 'embed'
                ? styles.optionButtonActive
                : styles.optionButton
            }
            onClick={() => setImportMode('embed')}
          >
            {UI.notes.importAsEmbed}
          </button>
        </div>

        {importMode === 'content' ? (
          <>
            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="import-title">
                {UI.notes.titleInputLabel}
              </label>
              <input
                id="import-title"
                className={styles.input}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className={styles.formRow}>
              <span className={styles.label}>
                {UI.notes.importAsNoteContent}
              </span>
              <div className={styles.radioGroup}>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    checked={contentMode === 'replace'}
                    onChange={() => setContentMode('replace')}
                  />
                  {UI.notes.importReplaceContent}
                </label>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    checked={contentMode === 'append'}
                    onChange={() => setContentMode('append')}
                  />
                  {UI.notes.importAppendContent}
                </label>
              </div>
            </div>
          </>
        ) : null}

        {loading ? (
          <p className={styles.label}>{UI.notes.importProcessing}</p>
        ) : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
            disabled={loading}
          >
            {UI.common.cancel}
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void handleConfirm()}
            disabled={loading}
          >
            {UI.common.confirm}
          </button>
        </div>
      </section>
    </div>
  );
}
