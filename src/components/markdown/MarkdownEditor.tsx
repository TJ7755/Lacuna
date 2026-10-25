import { useId, useRef, useState, type DragEvent, type Ref } from 'react';
import { m as motion, AnimatePresence } from 'motion/react';
import { wrap, linePrefix, type ToolbarAction, type Selection } from './markdownSelection';
import { useMarkdownEditorHistory } from './useMarkdownEditorHistory';
import { MarkdownView } from './MarkdownView';
import { imageFileToAssetUrl, imageMarkdown } from './image';
import { nextClozeIndex } from '../../utils/cloze';
import { cn } from '../ui/cn';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { fieldLabelClassName } from '../ui/Field';
import { Button } from '../ui/Button';
import { ImageIcon } from '../ui/icons';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { modifierShortcutLabel } from '../../electron/runtime';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Show a Cloze button (only meaningful for cloze cards). */
  allowCloze?: boolean;
  /** Let specialised editors own image persistence and descriptions. */
  allowImages?: boolean;
  layout?: 'split' | 'tabs';
  compactToolbar?: boolean;
  /**
   * Opt-in to embed-aware toolbar actions and live-preview. Enables "Collapsible"
   * and "Video" toolbar buttons, and passes `allowEmbeds` to the preview pane.
   * Default false leaves card editors unchanged.
   */
  allowEmbeds?: boolean;
  minRows?: number;
  label?: string;
  /** Cloze preview mode for the live preview pane. */
  clozePreview?: 'front' | 'back' | 'none';
  /** Leave out the side preview, for screens that already show their own preview. */
  hidePreview?: boolean;
  onError?: (message: string) => void;
  /** Focus the textarea on mount (used by the quick-capture flow). */
  autoFocus?: boolean;
  /** Forwarded handle on the textarea so parents can drive a custom tab order. */
  inputRef?: Ref<HTMLTextAreaElement>;
  /** Tab (no shift) inside the textarea; native traversal remains if focus cannot move. */
  onTabForward?: () => void;
  /** Shift+Tab inside the textarea; native traversal remains if focus cannot move. */
  onTabBackward?: () => void;
  /** Ctrl/Cmd+Enter inside the textarea; preventDefault is applied for you. */
  onModEnter?: () => void;
  /** Accessible name for editors whose surrounding visual label is not a native label. */
  ariaLabel?: string;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  allowCloze = false,
  allowImages = true,
  layout = 'split',
  compactToolbar = false,
  allowEmbeds = false,
  minRows = 6,
  label,
  clozePreview = 'none',
  hidePreview = false,
  onError,
  autoFocus = false,
  inputRef,
  onTabForward,
  onTabBackward,
  onModEnter,
  ariaLabel,
  ariaInvalid,
  ariaDescribedBy,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep the internal ref (used by the toolbar) while also forwarding to the parent.
  function setTextareaRef(el: HTMLTextAreaElement | null) {
    textareaRef.current = el;
    if (typeof inputRef === 'function') inputRef(el);
    else if (inputRef) (inputRef as { current: HTMLTextAreaElement | null }).current = el;
  }
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [moreTools, setMoreTools] = useState(false);
  const [mobileTab, setMobileTab] = useState<'write' | 'preview'>('write');
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  const {
    currentValueRef,
    pushHistory,
    scheduleHistoryPush,
    cancelHistoryTimer,
    undo,
    redo,
    applyReplacement,
  } = useMarkdownEditorHistory(value, onChange, textareaRef);

  function currentSelection(): Selection {
    const el = textareaRef.current!;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    return {
      before: value.slice(0, start),
      selected: value.slice(start, end),
      after: value.slice(end),
      full: value,
    };
  }

  function runAction(action: ToolbarAction) {
    if (!textareaRef.current) return;
    applyReplacement(action.apply(currentSelection()));
  }

  const actions: ToolbarAction[] = [
    {
      label: <strong>B</strong>,
      title: 'Bold',
      shortcut: 'B',
      apply: (s) => wrap(s, '**', '**', 'bold text'),
    },
    {
      label: <em className="font-serif">I</em>,
      title: 'Italic',
      shortcut: 'I',
      apply: (s) => wrap(s, '_', '_', 'italic text'),
    },
    { label: 'H', title: 'Heading', apply: (s) => linePrefix(s, '## ', 'Heading') },
    { label: '•', title: 'Bullet list', apply: (s) => linePrefix(s, '- ', 'List item') },
    { label: '1.', title: 'Numbered list', apply: (s) => linePrefix(s, '1. ', 'List item') },
    { label: '< >', title: 'Inline code', apply: (s) => wrap(s, '`', '`', 'code') },
    {
      label: '{ }',
      title: 'Code block',
      apply: (s) => wrap(s, '```\n', '\n```', 'code'),
    },
    { label: 'Link', title: 'Link', apply: (s) => wrap(s, '[', '](https://)', 'text') },
    // Named in words: a teacher need not know the dollar-sign syntax to find maths.
    { label: 'Maths', title: 'Inline maths', apply: (s) => wrap(s, '$', '$', 'x^2') },
    {
      label: 'Maths block',
      title: 'Block maths',
      apply: (s) => wrap(s, '$$\n', '\n$$', 'x = y'),
    },
  ];

  const clozeAction: ToolbarAction = {
    label: 'Cloze',
    title: 'Cloze deletion',
    apply: (s) => {
      const n = nextClozeIndex(s.full);
      return wrap(s, `{{c${n}::`, '}}', 'hidden');
    },
  };

  // Embed actions — only rendered when allowEmbeds is true.
  const embedActions: ToolbarAction[] = [
    {
      label: 'Collapsible',
      title: 'Collapsible section',
      apply: (s) => {
        const inner = s.selected || 'content';
        const needsBreak = s.before.length > 0 && !s.before.endsWith('\n');
        const lead = needsBreak ? '\n' : '';
        const snippet = `<details><summary>Title</summary>\n\n${inner}\n\n</details>`;
        const text = s.before + lead + snippet + s.after;
        const selStart =
          s.before.length + lead.length + '<details><summary>Title</summary>\n\n'.length;
        return { text, selStart, selEnd: selStart + inner.length };
      },
    },
    {
      label: 'Video',
      title: 'Embed video (YouTube or Vimeo URL on its own line)',
      apply: (s) => {
        const placeholder = 'https://www.youtube.com/watch?v=';
        const needsBreak = s.before.length > 0 && !s.before.endsWith('\n');
        const lead = needsBreak ? '\n' : '';
        const text = s.before + lead + placeholder + s.after;
        const selStart = s.before.length + lead.length;
        return { text, selStart, selEnd: selStart + placeholder.length };
      },
    },
  ];

  async function insertImageFiles(files: FileList | File[]) {
    if (!allowImages) return;
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    cancelHistoryTimer();
    pushHistory();
    for (const file of images) {
      try {
        const dataUrl = await imageFileToAssetUrl(file);
        const sel = currentSelection();
        const md = imageMarkdown(dataUrl, file.name.replace(/\.[^.]+$/, ''));
        const needsBreak = sel.before.length > 0 && !sel.before.endsWith('\n');
        const insertion = (needsBreak ? '\n' : '') + md + '\n';
        const newText = sel.before + insertion + sel.after;
        currentValueRef.current = newText;
        onChange(newText);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Could not add that image.');
      }
    }
    // Capture the post-insertion state so redo works after undo.
    window.setTimeout(() => pushHistory(), 0);
  }

  async function handleDrop(e: DragEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) await insertImageFiles(e.dataTransfer.files);
  }

  const labelId = useId();
  const rows = Math.max(minRows, value.split('\n').length + 1);
  const showsMathsPreview =
    !hidePreview && layout !== 'split' && mobileTab === 'write' && /\$[^$\n]+\$/.test(value);

  return (
    // The whole field, toolbar included, marks focus in its text, as a plain input's border does.
    <div className="rounded-xl border-[1.5px] border-line bg-surface transition-colors has-[textarea:focus]:border-accent">
      {label && (
        <label
          htmlFor={labelId}
          className={cn(fieldLabelClassName, 'border-b border-line px-3.5 py-2.5')}
        >
          {label}
        </label>
      )}

      {/* Toolbar */}
      <div
        className={cn(
          'flex items-center gap-1 border-b border-line px-2 py-1.5',
          compactToolbar && !moreTools ? 'flex-nowrap overflow-x-auto' : 'flex-wrap',
        )}
      >
        {actions
          .filter(
            (a) =>
              !compactToolbar ||
              moreTools ||
              ['Bold', 'Italic', 'Link', 'Inline maths'].includes(a.title),
          )
          .map((a) => (
            <Button
              key={a.title}
              type="button"
              variant="ghost"
              size="sm"
              aria-label={a.title}
              title={a.shortcut ? `${a.title} (${modifierShortcutLabel(a.shortcut)})` : a.title}
              onClick={() => runAction(a)}
              className="shrink-0"
            >
              {a.label}
            </Button>
          ))}
        {compactToolbar && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title="More formatting"
            aria-expanded={moreTools}
            onClick={() => setMoreTools(!moreTools)}
            aria-label="More formatting"
            className="shrink-0"
          >
            {moreTools ? 'Less' : 'More'}
          </Button>
        )}
        {allowCloze && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title={clozeAction.title}
            onClick={() => runAction(clozeAction)}
            className="shrink-0 text-accent-ink"
          >
            {clozeAction.label}
          </Button>
        )}
        {allowEmbeds &&
          embedActions.map((a) => (
            <Button
              key={a.title}
              type="button"
              variant="ghost"
              size="sm"
              title={a.title}
              onClick={() => runAction(a)}
              className="shrink-0"
            >
              {a.label}
            </Button>
          ))}
        {allowImages && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title="Insert image"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0"
          >
            <ImageIcon width={15} height={15} />
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && insertImageFiles(e.target.files)}
        />

        {/* Mobile write/preview switch */}
        <div
          className={cn(
            'ml-auto flex gap-1',
            layout === 'split' && 'md:hidden',
            hidePreview && 'hidden',
          )}
        >
          {(['write', 'preview'] as const).map((tab) => (
            <Button
              key={tab}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={mobileTab === tab}
              onClick={() => setMobileTab(tab)}
              className={cn(
                'capitalize',
                mobileTab === tab ? 'bg-accent-soft text-accent-ink' : 'text-ink-faint',
              )}
            >
              {tab}
            </Button>
          ))}
        </div>
      </div>

      {/* Split: editor + live preview (stacked/tabbed on mobile) */}
      <div className={cn('grid', layout === 'split' && !hidePreview && 'md:grid-cols-2')}>
        <div
          className={cn(
            layout === 'split' && 'md:block',
            !hidePreview && mobileTab === 'preview' && 'hidden',
          )}
        >
          <textarea
            id={labelId}
            ref={setTextareaRef}
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => {
              currentValueRef.current = e.target.value;
              onChange(e.target.value);
              scheduleHistoryPush();
            }}
            onKeyDown={(e) => {
              if (e.defaultPrevented || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)
                return;
              if (onModEnter && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                onModEnter();
                return;
              }
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                  redo();
                } else {
                  undo();
                }
                return;
              }
              const shortcut =
                (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey
                  ? actions.find((action) => action.shortcut?.toLowerCase() === e.key.toLowerCase())
                  : undefined;
              if (shortcut) {
                e.preventDefault();
                runAction(shortcut);
                return;
              }
              if (e.ctrlKey && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                redo();
                return;
              }
              if (e.key !== 'Tab') return;
              const moveFocus = e.shiftKey ? onTabBackward : onTabForward;
              if (moveFocus) {
                moveFocus();
                if (document.activeElement !== e.currentTarget) e.preventDefault();
              }
            }}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            placeholder={placeholder}
            aria-keyshortcuts={onModEnter ? 'Control+Enter Meta+Enter' : undefined}
            aria-label={ariaLabel ?? label}
            aria-invalid={ariaInvalid || undefined}
            aria-describedby={ariaDescribedBy}
            rows={rows}
            spellCheck
            className={cn(
              'w-full resize-none bg-transparent px-4 py-3 font-mono text-sm leading-relaxed text-ink',
              'placeholder:text-ink-faint focus:outline-none focus-visible:shadow-none',
              dragOver && 'ring-2 ring-inset ring-accent/60',
            )}
          />
          {/* Maths is written as $...$; show how it reads without leaving the Write tab. */}
          <AnimatedDisclosure open={showsMathsPreview}>
            <div
              data-maths-preview=""
              className="border-t border-line px-4 py-2 text-sm text-ink-soft"
            >
              <span className="mr-2 text-xs text-ink-faint">Preview</span>
              <MarkdownView source={value} clozeMode={clozePreview} allowEmbeds={allowEmbeds} />
            </div>
          </AnimatedDisclosure>
        </div>
        {!hidePreview && (
          <div
            className={cn(
              'min-h-[8rem] border-line px-4 py-3',
              layout === 'split' && 'md:border-l',
              mobileTab === 'write' && (layout === 'split' ? 'hidden md:block' : 'hidden'),
            )}
          >
            <AnimatePresence mode="sync">
              {value.trim() ? (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 * m }}
                >
                  <MarkdownView source={value} clozeMode={clozePreview} allowEmbeds={allowEmbeds} />
                </motion.div>
              ) : (
                <motion.p
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 * m }}
                  className="text-sm text-ink-faint"
                >
                  Preview appears here.
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
