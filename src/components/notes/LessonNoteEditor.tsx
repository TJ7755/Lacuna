import { useState } from 'react';
import { MarkdownEditor } from '../markdown/MarkdownEditor';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import type { Note } from '../../db/types';

interface LessonNoteEditorProps {
  /** Existing note to edit; omit for a new-note form. */
  note?: Note;
  onSave: (data: { name: string; content: string }) => void | Promise<void>;
  onCancel: () => void;
  /** Set to true while the parent is persisting the save. Disables actions. */
  busy?: boolean;
}

/**
 * Single-note editor. Does not write to the database; the parent wires
 * persistence via `onSave`. This keeps the component usable by both the
 * lesson-view CRUD flow and any AI-authoring path.
 */
export function LessonNoteEditor({ note, onSave, onCancel, busy = false }: LessonNoteEditorProps) {
  const [name, setName] = useState(note?.name ?? '');
  const [content, setContent] = useState(note?.content ?? '');

  const canSave = name.trim().length > 0 && !busy;

  async function handleSave() {
    if (!canSave) return;
    await onSave({ name: name.trim(), content });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Note title */}
      <div>
        <label className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-ink-faint">
          Title
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Note title"
          disabled={busy}
          className={cn(
            'w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink',
            'placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/60',
            'disabled:opacity-40',
          )}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              void handleSave();
            }
          }}
        />
      </div>

      {/* Note body */}
      <MarkdownEditor
        value={content}
        onChange={setContent}
        placeholder="Write your notes in Markdown…"
        label="Content"
        minRows={8}
        allowEmbeds
      />

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
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
