import { useState } from 'react';
import { MarkdownEditor } from '../markdown/MarkdownEditor';
import { MarkdownView } from '../markdown/MarkdownView';

export function QuestionSetPromptEditor({
  value,
  onChange,
  shared,
}: {
  value: string;
  onChange: (value: string) => void;
  shared: boolean;
}) {
  const [editing, setEditing] = useState(!value.trim());
  return (
    <section aria-label={shared ? 'Shared question or source material' : 'Question'}>
      {editing ? (
        <>
          <MarkdownEditor
            ariaLabel="Question text"
            label={shared ? 'Shared question or source material' : 'Question'}
            value={value}
            onChange={onChange}
            minRows={5}
            allowImages={false}
            layout="tabs"
            compactToolbar
          />
          <button className="qs-back" onClick={() => setEditing(false)}>
            Done editing text
          </button>
        </>
      ) : (
        <>
          <MarkdownView source={value} />
          <button className="qs-back" onClick={() => setEditing(true)}>
            {value.trim() ? 'Edit text' : 'Write question'}
          </button>
        </>
      )}
    </section>
  );
}
