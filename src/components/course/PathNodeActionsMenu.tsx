import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PathNode } from '../../course/path';
import type { CourseAssessment, Lesson } from '../../db/types';
import { deleteCourseAssessment, updateCourseAssessment } from '../../db/assessmentRepository';
import {
  deletePracticeNode,
  deleteQuestionSetPracticeNode,
  updatePracticeNode,
  updateQuestionSetPracticeNode,
} from '../../db/practiceNodeRepository';
import { dialogKeyDown } from '../../hooks/dialogKeys';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';
import { DialogHeader, DialogPanel } from '../ui/DialogPanel';
import { ChevronDownIcon, EditIcon, MoreIcon, TrashIcon } from '../ui/icons';
import { Menu } from '../ui/Menu';
import { useToast } from '../ui/Toast';
import { focusAfterLessonDeletion } from './LessonActionsMenu';

type EditablePathNode = Exclude<PathNode, { nodeType: 'lesson' }>;

/** Authored stops share the lesson menu's trigger, actions and confirmation chrome. */
export function PathNodeActionsMenu({
  node,
  lessons,
  onEdit,
}: {
  node: EditablePathNode;
  lessons: Lesson[];
  onEdit: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const { notify } = useToast();
  const assessment: CourseAssessment | undefined =
    node.nodeType === 'checkpoint' ? node.assessment : undefined;
  const practice = node.nodeType !== 'checkpoint' ? node.practiceNode : undefined;
  if (!assessment && !practice) return null;
  const name = assessment?.name ?? practice!.name;
  const kind = assessment
    ? 'Assessment'
    : node.nodeType === 'practice-question-set'
      ? 'Question set'
      : 'Practice';
  const deleteLabel = assessment
    ? 'Delete checkpoint'
    : node.nodeType === 'practice-question-set'
      ? 'Delete activity'
      : 'Delete practice';
  const final = assessment?.kind === 'final';
  const position = lessons.findIndex((lesson) => lesson.id === node.afterLessonId);
  // Question Set activities require an actual Lesson anchor; other stops may precede all lessons.
  const minimum = node.nodeType === 'practice-question-set' ? 0 : -1;

  async function run(action: () => Promise<void>, deleted = false) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await action();
      if (deleted) {
        setConfirming(false);
        focusAfterLessonDeletion(['#course-path-heading', 'main h1']);
      }
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Could not update this path node.',
        'negative',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function move(delta: -1 | 1) {
    const target = lessons[position + delta];
    void run(() => {
      if (assessment)
        return updateCourseAssessment(assessment.id, { afterLessonId: target?.id ?? null });
      if (node.nodeType === 'practice-question-set')
        return updateQuestionSetPracticeNode(node.practiceNode.id, target.id).then(() => undefined);
      return updatePracticeNode(practice!.id, { position: target?.orderIndex });
    });
  }

  function remove() {
    void run(() => {
      if (assessment) return deleteCourseAssessment(assessment.id);
      if (node.nodeType === 'practice-question-set')
        return deleteQuestionSetPracticeNode(node.practiceNode.id);
      return deletePracticeNode(practice!.id);
    }, true);
  }

  return (
    <>
      <Menu
        label={`${kind} actions: ${name}`}
        triggerWidth={44}
        items={[
          {
            label: 'Edit',
            icon: <EditIcon width={16} height={16} />,
            onSelect: onEdit,
            disabled: busy,
          },
          ...(!final
            ? [
                {
                  label: 'Move up',
                  icon: <ChevronDownIcon width={16} height={16} className="rotate-180" />,
                  disabled: busy || position <= minimum,
                  onSelect: () => move(-1),
                },
                {
                  label: 'Move down',
                  icon: <ChevronDownIcon width={16} height={16} />,
                  disabled: busy || position >= lessons.length - 1,
                  onSelect: () => move(1),
                },
                {
                  label: deleteLabel,
                  icon: <TrashIcon width={16} height={16} />,
                  onSelect: () => setConfirming(true),
                  disabled: busy,
                },
              ]
            : []),
        ]}
      >
        <MoreIcon width={18} height={18} />
      </Menu>
      {confirming &&
        createPortal(
          <DeletePathNodeDialog
            name={name}
            deleteLabel={deleteLabel}
            busy={busy}
            consequence={
              assessment
                ? 'The checkpoint and its revision plan will be deleted. Cards and question sets will remain.'
                : node.nodeType === 'practice-question-set'
                  ? 'The activity will be removed from the path. The question set and attempts will remain.'
                  : 'The practice node and its progress will be deleted. Cards will remain in the course.'
            }
            onCancel={() => {
              if (!pending.current) setConfirming(false);
            }}
            onConfirm={remove}
          />,
          document.body,
        )}
    </>
  );
}

function DeletePathNodeDialog({
  name,
  deleteLabel,
  consequence,
  busy,
  onCancel,
  onConfirm,
}: {
  name: string;
  deleteLabel: string;
  consequence: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const trapRef = useFocusTrap(true, { autoFocusSelector: '[data-cancel]' });
  return (
    <DialogPanel
      label={`Delete ${name}?`}
      trapRef={trapRef}
      onBackdropClick={onCancel}
      className="max-w-md"
      onKeyDown={dialogKeyDown({ onCancel })}
    >
      <DialogHeader title={`Delete ${name}?`} onClose={onCancel} closeLabel="Close" />
      <p className="px-6 py-5 text-sm text-ink-soft">{consequence}</p>
      <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button variant="ghost" data-cancel disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" disabled={busy} onClick={onConfirm}>
          {deleteLabel}
        </Button>
      </footer>
    </DialogPanel>
  );
}
