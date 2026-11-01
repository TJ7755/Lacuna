import { useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { makeId } from '../../utils/id';
import {
  addQuestionSetNode,
  flattenQuestionSet,
  moveQuestionSetNode,
  removeQuestionSetNode,
  updateQuestionSetNodeAnswer,
  updateQuestionSetNodePrompt,
  type QuestionSetAuthoringNode,
} from '../../questions/questionSetAuthoring';
import type { QuestionSet, QuestionSetIssue } from '@lacuna/core/questions/questionSets';
import type { QuestionSetDraftSession } from '../../questions/questionSetDraftSession';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { useToast } from '../ui/Toast';
import { ConfirmInline } from '../ui/ConfirmInline';
import {
  hasChildren,
  indentRow,
  isEmptyRow,
  outdentRow,
  reparentRow,
  siblings,
} from './composerEditing';
import { focusComposerField, useComposerKeyboard, type ComposerField } from './useComposerKeyboard';
import { QuestionComposerRow } from './QuestionComposerRow';
import { issueMessage, nodeMarks } from './presentation';

export function composerLabel(rows: QuestionSetAuthoringNode[], row: QuestionSetAuthoringNode) {
  return [
    ...row.parentIds.map((id) => rows.find((candidate) => candidate.id === id)!.label),
    row.label,
  ].join(' ');
}
export function issueRowId(content: QuestionSet, issue: QuestionSetIssue) {
  const indices = [...issue.path.matchAll(/(?:questions|parts|subparts)\[(\d+)\]/g)].map((match) =>
    Number(match[1]),
  );
  const question = content.questions[indices[0]];
  return (
    question?.parts[indices[1]]?.subparts[indices[2]]?.id ??
    question?.parts[indices[1]]?.id ??
    question?.id
  );
}

export function QuestionComposer({
  content,
  session,
  issues,
  focusIssue,
}: {
  content: QuestionSet;
  session: QuestionSetDraftSession;
  issues: QuestionSetIssue[];
  focusIssue: number;
}) {
  const rows = flattenQuestionSet(content);
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<QuestionSetAuthoringNode | null>(null);
  const initialised = useRef(false);
  const handledValidation = useRef(0);
  const pendingFocus = useRef<{ id: string; field?: ComposerField } | null>(null);
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  const { notify } = useToast();
  const focus = (id: string, field?: ComposerField) => focusComposerField(root.current, id, field);
  useLayoutEffect(() => {
    if (!initialised.current) {
      initialised.current = true;
      if (!rows.length) {
        const id = makeId();
        pendingFocus.current = { id };
        session.update((set) => addQuestionSetNode(set, { id }));
      } else if (rows.every((row) => isEmptyRow(row))) focusComposerField(root.current, rows[0].id);
    }
    if (pendingFocus.current) {
      const { id, field } = pendingFocus.current;
      if (rows.some((row) => row.id === id)) {
        pendingFocus.current = null;
        focusComposerField(root.current, id, field);
      }
    }
  }, [content, rows, session]);
  useLayoutEffect(() => {
    if (!focusIssue || handledValidation.current === focusIssue) return;
    handledValidation.current = focusIssue;
    const first = issues.map((issue) => issueRowId(content, issue)).find(Boolean);
    if (first) focusComposerField(root.current, first);
  }, [focusIssue, content, issues]);
  const commit = (next: QuestionSet, id?: string, field?: ComposerField) => {
    if (id) pendingFocus.current = { id, field };
    session.update(() => next);
  };
  const add = (row?: QuestionSetAuthoringNode, parentIds?: string[]) => {
    const id = makeId();
    const peers = row ? siblings(content, row) : [];
    commit(
      addQuestionSetNode(content, {
        id,
        parentIds: parentIds ?? row?.parentIds ?? [],
        index: row && !parentIds ? peers.findIndex((peer) => peer.id === row.id) + 1 : undefined,
      }),
      id,
    );
  };
  const indent = (row: QuestionSetAuthoringNode, base = content) => {
    const result = indentRow(base, row);
    if (!result) {
      focus(row.id, 'scheme');
      return;
    }
    commit(result.content, row.id);
    if (result.moved) {
      const movedRow = flattenQuestionSet(result.content).find(
        (candidate) => candidate.id === row.id,
      )!;
      const parentId = movedRow.parentIds.at(-1)!;
      notify(`Mark scheme moved into ${movedRow.label}`, 'neutral', {
        actionLabel: 'Undo',
        replaceKey: 'composer-indent',
        onAction: () => {
          // Revert only the affected question; edits elsewhere in the set remain intact.
          session.update((current) => {
            const currentRows = flattenQuestionSet(current);
            const currentRow = currentRows.find((candidate) => candidate.id === row.id);
            const parent = currentRows.find((candidate) => candidate.id === parentId);
            if (
              !currentRow ||
              !parent ||
              hasChildren(currentRow) ||
              currentRow.parentIds.at(-1) !== parentId
            )
              return current;
            let next = current;
            if (
              currentRows.filter((candidate) => candidate.parentIds.at(-1) === parentId).length ===
              1
            ) {
              next = updateQuestionSetNodeAnswer(next, parentId, currentRow.node.answer);
              next = updateQuestionSetNodeAnswer(next, row.id, undefined);
            }
            const restored = flattenQuestionSet(next).find((candidate) => candidate.id === row.id)!;
            return reparentRow(
              next,
              restored,
              row.parentIds,
              Math.min(
                siblings(current, row).length,
                siblings(base, row).findIndex((peer) => peer.id === row.id),
              ),
            );
          });
          focus(row.id);
        },
      });
    }
  };
  const remove = (row: QuestionSetAuthoringNode) => {
    if (rows.length === 1 && isEmptyRow(row)) return;
    const previous = rows[Math.max(0, rows.findIndex((candidate) => candidate.id === row.id) - 1)];
    let next = removeQuestionSetNode(content, row.id);
    let id = previous.id;
    if (!next.questions.length) {
      id = makeId();
      next = addQuestionSetNode(next, { id });
    }
    commit(next, id, hasChildren(previous) ? 'question' : 'marks');
    setConfirmation(null);
  };
  const move = (row: QuestionSetAuthoringNode, direction: number) => {
    const peers = siblings(content, row);
    const index = peers.findIndex((peer) => peer.id === row.id) + direction;
    if (index >= 0 && index < peers.length)
      commit(moveQuestionSetNode(content, row.id, index), row.id);
  };
  const keyboard = useComposerKeyboard({
    focus,
    insert: add,
    indent,
    outdent: (row) => {
      const next = outdentRow(content, row);
      if (next) commit(next, row.id);
    },
    remove,
    move,
  });
  return (
    <div className="qs-composer-sheet rounded-3xl bg-surface card-surface" ref={root}>
      <div className="qs-composer-captions font-display text-xs text-ink-faint" aria-hidden="true">
        <span />
        <span>Question</span>
        <span>Mark scheme</span>
        <span>Marks</span>
        <span />
      </div>
      <AnimatePresence initial={false}>
        {rows.map((row, index) => {
          const peers = siblings(content, row);
          const peerIndex = peers.findIndex((peer) => peer.id === row.id);
          return (
            <QuestionComposerRow
              key={row.id}
              row={row}
              label={composerLabel(rows, row)}
              stem={hasChildren(row)}
              total={nodeMarks(row.node)}
              active={active === row.id}
              issues={issues
                .filter((issue) => issueRowId(content, issue) === row.id)
                .map((issue) => issueMessage(content, issue))}
              multiplier={multiplier}
              session={session}
              onPrompt={(value) =>
                session.update((set) => updateQuestionSetNodePrompt(set, row.id, value))
              }
              onAnswer={(value) =>
                session.update((set) => updateQuestionSetNodeAnswer(set, row.id, value))
              }
              onFocus={() => setActive(row.id)}
              onBlur={() => setActive((current) => (current === row.id ? null : current))}
              onKeyDown={(event) => keyboard(event, row, rows[index + 1], rows[index - 1])}
              onMove={(direction) => move(row, direction)}
              canMoveUp={peerIndex > 0}
              canMoveDown={peerIndex < peers.length - 1}
              onDelete={() => (isEmptyRow(row) ? remove(row) : setConfirmation(row))}
            />
          );
        })}
      </AnimatePresence>
      {confirmation && (
        <div className="px-5 py-3">
          <ConfirmInline
            message={`Remove ${composerLabel(rows, confirmation)} and all its parts?`}
            confirmLabel="Delete"
            focusOnMount="cancel"
            onConfirm={() => remove(confirmation)}
            onCancel={() => setConfirmation(null)}
          />
        </div>
      )}
      <div className="qs-composer-adders">
        <button type="button" onClick={() => add()}>
          + Question
        </button>
        <button
          type="button"
          onClick={() => {
            const last = rows.at(-1);
            if (!last) {
              add();
              return;
            }
            const question = rows
              .slice()
              .reverse()
              .find((row) => row.depth === 0)!;
            if (hasChildren(question)) add(undefined, [question.id]);
            else {
              const id = makeId();
              const next = addQuestionSetNode(content, { id });
              const blank = flattenQuestionSet(next).find((row) => row.id === id)!;
              indent(blank, next);
            }
          }}
        >
          + Part
        </button>
      </div>
    </div>
  );
}
