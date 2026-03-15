import { useEditor, EditorContent } from '@tiptap/react';
import { useRef } from 'react';
import type { Note } from '../../db/repositories/notes';
import { createEditorConfig } from '../../lib/editor';
import { UI } from '../../ui-strings';
import { EditorToolbar } from './EditorToolbar';
import { ImportDocumentButton } from './ImportDocumentButton';
import styles from './NoteEditor.module.css';

interface NoteEditorProps {
  note: Note;
  onTitleChange: (title: string) => void;
  onContentChange: (content: object) => void;
  onImportAsContent: (params: {
    title: string;
    content: object;
  }) => Promise<void>;
}

export function NoteEditor({
  note,
  onTitleChange,
  onContentChange,
  onImportAsContent,
}: NoteEditorProps) {
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const editor = useEditor({
    ...createEditorConfig(),
    content: note.content,
    immediatelyRender: false,
    onUpdate: ({ editor: activeEditor }) => {
      onContentChange(activeEditor.getJSON());
    },
  });

  return (
    <section className={styles.editorWrap}>
      <input
        ref={titleInputRef}
        data-note-title="true"
        type="text"
        defaultValue={note.title}
        onChange={(event) => onTitleChange(event.target.value)}
        className={styles.titleInput}
        aria-label={UI.notes.titleInputLabel}
      />
      <EditorToolbar
        editor={editor}
        afterActions={
          <ImportDocumentButton
            editor={editor}
            currentTitle={note.title}
            currentContent={note.content}
            onImportAsContent={async (params) => {
              await onImportAsContent(params);

              if (editor) {
                editor.commands.setContent(params.content, {
                  emitUpdate: false,
                });
              }

              if (titleInputRef.current) {
                titleInputRef.current.value = params.title;
              }
            }}
          />
        }
      />
      <div className={styles.editorSurface}>
        <EditorContent editor={editor} className={styles.editorContent} />
      </div>
    </section>
  );
}
