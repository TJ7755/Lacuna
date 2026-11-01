import { useLayoutEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, m as motion } from 'motion/react';
import { MarkdownView } from '../markdown/MarkdownView';
import { Button } from '../ui/Button';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { ConfirmInline } from '../ui/ConfirmInline';
import { fieldLabelClassName, inputClassName, inputFrameClassName } from '../ui/Field';
import { motionTransition } from '../ui/motion';
import { cn } from '../ui/cn';
import {
  createNoteAnnotation,
  deleteNoteAnnotation,
  listNoteAnnotations,
  updateNoteAnnotation,
} from '../../db/repository';
import type { Note, NoteAnnotation } from '@lacuna/core/db/types';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import {
  renderAnnotationHighlights,
  sourceAnchorFromSelection,
  type SourceAnchor,
} from './noteAnchors';

interface AnnotatedNoteContentProps {
  note: Note;
}

const EMPTY_ANNOTATIONS: NoteAnnotation[] = [];

export function AnnotatedNoteContent({ note }: AnnotatedNoteContentProps) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const transition = motionTransition('feedback', multiplier);
  const queryResult = useLiveQuery(() => listNoteAnnotations(note.id), [note.id], []);
  const annotations = Array.isArray(queryResult) ? queryResult : EMPTY_ANNOTATIONS;
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [pendingAnchor, setPendingAnchor] = useState<SourceAnchor | null>(null);
  const [draftBody, setDraftBody] = useState('');
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [detachedIds, setDetachedIds] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const returnFocusAction = useRef<{ id: string; action: 'edit' | 'delete' } | null>(null);

  useLayoutEffect(() => {
    if (editingId || deletingId || !returnFocusAction.current) return;
    const target = returnFocusAction.current;
    returnFocusAction.current = null;
    const actions = rootRef.current?.querySelectorAll<HTMLButtonElement>(
      '[data-annotation-action]',
    );
    Array.from(actions ?? [])
      .find(
        (button) =>
          button.dataset.annotationId === target.id &&
          button.dataset.annotationAction === target.action,
      )
      ?.focus();
  }, [deletingId, editingId]);

  useLayoutEffect(() => {
    const root = contentRef.current?.querySelector<HTMLElement>('.prose-lacuna');
    if (!root) return;
    const markdownRoot = root;
    const observer = new MutationObserver(() => decorate());

    function decorate() {
      // MarkdownView may replace its HTML after resolving local image assets.
      // Disconnect while adding marks so our own DOM decoration does not cause
      // an observer loop.
      observer.disconnect();
      setDetachedIds(renderAnnotationHighlights(markdownRoot, note.content, annotations));
      observer.observe(markdownRoot, { childList: true, subtree: true });
    }

    decorate();
    return () => observer.disconnect();
  }, [annotations, note.content]);

  function captureSelection() {
    const root = contentRef.current?.querySelector<HTMLElement>('.prose-lacuna');
    if (!root) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !root.contains(selection.anchorNode)) return;

    const result = sourceAnchorFromSelection(root, note.content, selection);
    if (result.anchor) {
      setPendingAnchor(result.anchor);
      setDraftBody('');
      setSelectionError(null);
      selection.removeAllRanges();
    } else {
      setPendingAnchor(null);
      setSelectionError(result.error);
    }
  }

  async function saveNewAnnotation() {
    if (!pendingAnchor) return;
    setBusy(true);
    try {
      await createNoteAnnotation(
        note.id,
        pendingAnchor.startOffset,
        pendingAnchor.endOffset,
        pendingAnchor.selectedText,
        draftBody,
      );
      setPendingAnchor(null);
      setDraftBody('');
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(annotation: NoteAnnotation) {
    setBusy(true);
    try {
      await updateNoteAnnotation(annotation.id, { body: editBody.trim() || undefined });
      returnFocusAction.current = { id: annotation.id, action: 'edit' };
      setEditingId(null);
      setEditBody('');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(id: string) {
    setBusy(true);
    try {
      await deleteNoteAnnotation(id);
      setDeletingId(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef}>
      <div
        ref={contentRef}
        onMouseUp={captureSelection}
        onKeyUp={captureSelection}
        aria-label={`${note.name} note content`}
      >
        <MarkdownView source={note.content} allowEmbeds />
      </div>

      <AnimatedDisclosure open={!!selectionError}>
        <div className="mt-3 flex items-start justify-between gap-3 rounded-2xl bg-ink/[0.04] px-3 py-2">
          <p role="status" className="text-xs text-ink-soft">
            {selectionError}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelectionError(null)}
            className="shrink-0"
          >
            Dismiss
          </Button>
        </div>
      </AnimatedDisclosure>

      <AnimatedDisclosure open={!!pendingAnchor}>
        {pendingAnchor && (
          <div className="mt-4 rounded-3xl bg-surface p-5 card-surface">
            <p className="border-l-2 border-accent/50 pl-3 text-sm text-ink">
              {pendingAnchor.selectedText}
            </p>
            <label className={cn(fieldLabelClassName, 'mt-4')} htmlFor={`annotation-${note.id}`}>
              Annotation
            </label>
            <textarea
              id={`annotation-${note.id}`}
              value={draftBody}
              onChange={(event) => setDraftBody(event.target.value)}
              rows={2}
              autoFocus
              className={cn(inputClassName, 'resize-y text-sm placeholder:text-ink-faint')}
              placeholder="Add a note to this highlight"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setPendingAnchor(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={saveNewAnnotation}
              >
                Save highlight
              </Button>
            </div>
          </div>
        )}
      </AnimatedDisclosure>

      {annotations.length > 0 && (
        <section
          aria-label={`Annotations for ${note.name}`}
          className="mt-5 border-t border-line pt-4"
        >
          <h3 className="font-display text-lg text-ink">Highlights</h3>
          <ul className="mt-2 space-y-2">
            {annotations.map((annotation) => {
              const detached = detachedIds.has(annotation.id);
              const editing = editingId === annotation.id;
              const deleting = deletingId === annotation.id;
              return (
                <motion.li
                  key={annotation.id}
                  layout={multiplier > 0 ? 'position' : false}
                  transition={transition}
                  className="rounded-3xl bg-surface p-5 card-surface"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink">{annotation.selectedText}</p>
                      {detached && (
                        <p className="mt-1 text-xs font-medium text-negative">
                          Detached from edited note
                        </p>
                      )}
                    </div>
                    <AnimatePresence initial={false} mode="popLayout">
                      {!editing && !deleting && (
                        <motion.div
                          key="annotation-actions"
                          initial={multiplier > 0 ? { opacity: 0 } : false}
                          animate={{ opacity: 1 }}
                          exit={multiplier > 0 ? { opacity: 0 } : undefined}
                          transition={transition}
                          className="flex shrink-0 gap-1"
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-annotation-action="edit"
                            data-annotation-id={annotation.id}
                            onClick={() => {
                              setEditingId(annotation.id);
                              setEditBody(annotation.body ?? '');
                              setDeletingId(null);
                            }}
                            aria-label={`Edit annotation for ${annotation.selectedText}`}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-annotation-action="delete"
                            data-annotation-id={annotation.id}
                            onClick={() => {
                              setDeletingId(annotation.id);
                              setEditingId(null);
                            }}
                            className="hover:bg-negative/10 hover:text-negative"
                            aria-label={`Delete annotation for ${annotation.selectedText}`}
                          >
                            Delete
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <AnimatedDisclosure open={editing}>
                    <div className="mt-3">
                      <label htmlFor={`edit-annotation-${annotation.id}`} className="sr-only">
                        Annotation text
                      </label>
                      <textarea
                        id={`edit-annotation-${annotation.id}`}
                        value={editBody}
                        onChange={(event) => setEditBody(event.target.value)}
                        rows={2}
                        autoFocus
                        className={cn(inputFrameClassName, 'w-full resize-y text-sm')}
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            returnFocusAction.current = {
                              id: annotation.id,
                              action: 'edit',
                            };
                            setEditingId(null);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={busy}
                          onClick={() => saveEdit(annotation)}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  </AnimatedDisclosure>
                  <AnimatedDisclosure open={!editing && deleting}>
                    <ConfirmInline
                      className="mt-3"
                      message="Delete this highlight?"
                      confirmLabel="Delete"
                      disabled={busy}
                      focusOnMount="cancel"
                      onCancel={() => {
                        returnFocusAction.current = { id: annotation.id, action: 'delete' };
                        setDeletingId(null);
                      }}
                      onConfirm={() => confirmDelete(annotation.id)}
                    />
                  </AnimatedDisclosure>
                  <AnimatedDisclosure open={!editing && !deleting && !!annotation.body}>
                    <p className="mt-2 text-sm text-ink-soft">{annotation.body}</p>
                  </AnimatedDisclosure>
                </motion.li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
