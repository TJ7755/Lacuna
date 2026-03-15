import type { Editor } from '@tiptap/react';
import type { ChangeEvent } from 'react';
import { useRef, useState } from 'react';
import { UI } from '../../ui-strings';
import { ImportDocumentModal } from './ImportDocumentModal';
import styles from './EditorToolbar.module.css';

type SupportedDocumentType = 'pdf' | 'docx';

interface ImportDocumentButtonProps {
  editor: Editor | null;
  currentTitle: string;
  currentContent: object;
  onImportAsContent: (params: {
    title: string;
    content: object;
  }) => Promise<void>;
}

const EMBED_MAX_SIZE_BYTES = 5 * 1024 * 1024;

function getFileType(file: File): SupportedDocumentType | null {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.pdf')) {
    return 'pdf';
  }

  if (lowerName.endsWith('.docx')) {
    return 'docx';
  }

  return null;
}

export function ImportDocumentButton({
  editor,
  currentTitle,
  currentContent,
  onImportAsContent,
}: ImportDocumentButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileType, setSelectedFileType] =
    useState<SupportedDocumentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = '';

    if (!file) {
      return;
    }

    const fileType = getFileType(file);

    if (!fileType) {
      setError(UI.notes.importErrorType);
      return;
    }

    if (file.size > EMBED_MAX_SIZE_BYTES) {
      setError(UI.notes.importEmbedErrorSize);
      return;
    }

    setError(null);
    setSelectedFile(file);
    setSelectedFileType(fileType);
  };

  return (
    <>
      <button
        type="button"
        className={styles.button}
        onClick={() => inputRef.current?.click()}
      >
        {UI.notes.importDocument}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {error ? <span className={styles.toolbarError}>{error}</span> : null}

      {selectedFile && selectedFileType ? (
        <ImportDocumentModal
          file={selectedFile}
          fileType={selectedFileType}
          currentTitle={currentTitle}
          currentContent={currentContent}
          editor={editor}
          onImportAsContent={onImportAsContent}
          onClose={() => {
            setSelectedFile(null);
            setSelectedFileType(null);
          }}
        />
      ) : null}
    </>
  );
}
