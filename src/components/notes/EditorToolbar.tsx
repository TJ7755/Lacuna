import type { Editor } from '@tiptap/react';
import type { ReactNode } from 'react';
import { UI } from '../../ui-strings';
import styles from './EditorToolbar.module.css';

interface EditorToolbarProps {
  editor: Editor | null;
  afterActions?: ReactNode;
}

interface ToolbarButton {
  key: string;
  label: string;
  isActive?: () => boolean;
  isDisabled?: () => boolean;
  onClick: () => void;
}

export function EditorToolbar({ editor, afterActions }: EditorToolbarProps) {
  if (!editor) {
    return null;
  }

  const buttons: ToolbarButton[] = [
    {
      key: 'bold',
      label: UI.notes.toolbarBold,
      isActive: () => editor.isActive('bold'),
      isDisabled: () => !editor.can().chain().focus().toggleBold().run(),
      onClick: () => editor.chain().focus().toggleBold().run(),
    },
    {
      key: 'italic',
      label: UI.notes.toolbarItalic,
      isActive: () => editor.isActive('italic'),
      isDisabled: () => !editor.can().chain().focus().toggleItalic().run(),
      onClick: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      key: 'strike',
      label: UI.notes.toolbarStrike,
      isActive: () => editor.isActive('strike'),
      isDisabled: () => !editor.can().chain().focus().toggleStrike().run(),
      onClick: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      key: 'h1',
      label: UI.notes.toolbarHeading1,
      isActive: () => editor.isActive('heading', { level: 1 }),
      onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      key: 'h2',
      label: UI.notes.toolbarHeading2,
      isActive: () => editor.isActive('heading', { level: 2 }),
      onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      key: 'h3',
      label: UI.notes.toolbarHeading3,
      isActive: () => editor.isActive('heading', { level: 3 }),
      onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      key: 'quote',
      label: UI.notes.toolbarQuote,
      isActive: () => editor.isActive('blockquote'),
      onClick: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      key: 'code',
      label: UI.notes.toolbarCode,
      isActive: () => editor.isActive('codeBlock'),
      onClick: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      key: 'rule',
      label: UI.notes.toolbarRule,
      onClick: () => editor.chain().focus().setHorizontalRule().run(),
    },
    {
      key: 'bulletList',
      label: UI.notes.toolbarBulletList,
      isActive: () => editor.isActive('bulletList'),
      onClick: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      key: 'orderedList',
      label: UI.notes.toolbarOrderedList,
      isActive: () => editor.isActive('orderedList'),
      onClick: () => editor.chain().focus().toggleOrderedList().run(),
    },
  ];

  return (
    <div
      className={styles.toolbar}
      role="toolbar"
      aria-label={UI.notes.toolbarLabel}
    >
      {buttons.map((button) => {
        const active = button.isActive?.() ?? false;
        const disabled = button.isDisabled?.() ?? false;

        return (
          <button
            key={button.key}
            type="button"
            className={`${styles.button} ${active ? styles.buttonActive : ''}`.trim()}
            onClick={button.onClick}
            disabled={disabled}
          >
            {button.label}
          </button>
        );
      })}

      {afterActions ? (
        <span className={styles.divider} aria-hidden="true" />
      ) : null}
      {afterActions ? (
        <div className={styles.afterActions}>{afterActions}</div>
      ) : null}
    </div>
  );
}
