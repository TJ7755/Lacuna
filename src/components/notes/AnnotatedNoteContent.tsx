import { useLayoutEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MarkdownView } from '../markdown/MarkdownView';
import { Button } from '../ui/Button';
import {
  createNoteAnnotation,
  deleteNoteAnnotation,
  listNoteAnnotations,
  updateNoteAnnotation,
} from '../../db/repository';
import type { Note, NoteAnnotation } from '../../db/types';
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
  const queryResult = useLiveQuery(() => listNoteAnnotations(note.id), [note.id], []);
  const annotations = Array.isArray(queryResult) ? queryResult : EMPTY_ANNOTATIONS;
  const contentRef = useRef<HTMLDivElement>(null);
  const [pendingAnchor, setPendingAnchor] = useState<SourceAnchor | null>(null);
  const [draftBody, setDraftBody] = useState('');
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [detachedIds, setDetachedIds] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    <div>
      <div
        ref={contentRef}
        onMouseUp={captureSelection}
        onKeyUp={captureSelection}
        aria-label={`${note.name} note content`}
      >
        <MarkdownView source={note.content} allowEmbeds />
      </div>

      {selectionError && (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-line bg-surface-raised px-3 py-2">
          <p role="status" className="text-xs text-ink-soft">
            {selectionError}
          </p>
          <button
            type="button"
            onClick={() => setSelectionError(null)}
            className="shrink-0 text-xs font-medium text-ink-soft hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      {pendingAnchor && (
        <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
          <p className="border-l-2 border-accent/50 pl-3 text-sm text-ink">
            {pendingAnchor.selectedText}
          </p>
          <label
            className="mt-3 block text-xs font-medium text-ink-soft"
            htmlFor={`annotation-${note.id}`}
          >
            Annotation <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <textarea
            id={`annotation-${note.id}`}
            value={draftBody}
            onChange={(event) => setDraftBody(event.target.value)}
            rows={2}
            autoFocus
            className="mt-1.5 w-full resize-y rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/15"
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

      {annotations.length > 0 && (
        <section
          aria-label={`Annotations for ${note.name}`}
          className="mt-5 border-t border-line pt-4"
        >
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Highlights
          </h3>
          <ul className="mt-2 space-y-2">
            {annotations.map((annotation) => {
              const detached = detachedIds.has(annotation.id);
              const editing = editingId === annotation.id;
              const deleting = deletingId === annotation.id;
              return (
                <li
                  key={annotation.id}
                  className="rounded-lg border border-line bg-surface-raised px-3 py-3"
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
                    {!editing && !deleting && (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(annotation.id);
                            setEditBody(annotation.body ?? '');
                            setDeletingId(null);
                          }}
                          className="min-h-9 rounded-md px-2 text-xs font-medium text-ink-soft hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                          aria-label={`Edit annotation for ${annotation.selectedText}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingId(annotation.id);
                            setEditingId(null);
                          }}
                          className="min-h-9 rounded-md px-2 text-xs font-medium text-ink-soft hover:bg-negative/10 hover:text-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative/50"
                          aria-label={`Delete annotation for ${annotation.selectedText}`}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {editing ? (
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
                        className="w-full resize-y rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => setEditingId(null)}
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
                  ) : deleting ? (
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <span className="mr-auto text-xs text-ink-soft">Delete this highlight?</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setDeletingId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={busy}
                        onClick={() => confirmDelete(annotation.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  ) : annotation.body ? (
                    <p className="mt-2 text-sm text-ink-soft">{annotation.body}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
