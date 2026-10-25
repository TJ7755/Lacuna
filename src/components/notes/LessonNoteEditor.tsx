import { useRef, useState } from 'react';
import { useEditorKeys } from '../../hooks/dialogKeys';
import { MarkdownEditor } from '../markdown/MarkdownEditor';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';
import type { Note } from '../../db/types';

interface LessonNoteEditorProps {
  /** Existing note to edit; omit for a new-note form. */
  note?: Note;
  onSave: (data: { name: string; content: string }) => void | Promise<void>;
  onCancel: () => void;
  /** Set to true while the parent is persisting the save. Disables actions. */
  busy?: boolean;
  /** A narrow creation surface uses the editor's existing Write/Preview tabs. */
  compact?: boolean;
}

/**
 * Single-note editor. Does not write to the database; the parent wires
 * persistence via `onSave`. This keeps the component usable by both the
 * lesson-view CRUD flow and any AI-authoring path.
 */
export function LessonNoteEditor({
  note,
  onSave,
  onCancel,
  busy = false,
  compact = false,
}: LessonNoteEditorProps) {
  const [name, setName] = useState(note?.name ?? '');
  const [content, setContent] = useState(note?.content ?? '');

  const saveRef = useRef<HTMLButtonElement>(null);
  const canSave = name.trim().length > 0 && !busy;

  async function handleSave() {
    if (!canSave) return;
    await onSave({ name: name.trim(), content });
  }

  const keys = useEditorKeys({
    onCancel: () => !busy && onCancel(),
    onSubmit: () => void handleSave(),
  });

  return (
    <div className="flex flex-col gap-4" {...keys}>
      <Field label="Title">
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Note title"
          disabled={busy}
          autoFocus
          className="min-h-11 text-sm placeholder:text-ink-faint disabled:opacity-40"
        />
      </Field>

      {/* Note body */}
      <MarkdownEditor
        value={content}
        onChange={setContent}
        placeholder="Write your notes in Markdown…"
        label="Content"
        minRows={compact ? 6 : 8}
        layout={compact ? 'tabs' : 'split'}
        allowEmbeds
        onTabForward={() => saveRef.current?.focus()}
      />

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          ref={saveRef}
          variant="primary"
          size="sm"
          onClick={() => void handleSave()}
          disabled={!canSave}
        >
          {busy ? 'Saving…' : note ? 'Save changes' : 'Add note'}
        </Button>
      </div>
    </div>
  );
}
