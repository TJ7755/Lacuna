import { useCallback, useMemo } from 'react';
import type { AssessmentSpecificationContext } from '../../course/assessmentCoverage';
import type { PathNode } from '../../course/path';
import type { Card, Lesson, LessonCardLink } from '../../db/types';
import { reorderLessons } from '../../db/lessonRepository';
import { updateCourseAssessment } from '../../db/assessmentRepository';
import { setLocalLessonOrder } from '../../db/lessonOrder';
import {
  localPathMoveOrder,
  localPathKeyboardTarget,
  moveAuthoredPathNode,
  pathMoveOrder,
  pathKeyboardTarget,
} from './pathNodeReorder';
import { usePathReorder } from './useLessonPathReorder';

export function useCoursePathReorder(
  courseId: string,
  nodes: PathNode[],
  lessons: Lesson[],
  cards: Card[],
  links: LessonCardLink[],
  enabled: boolean,
  onError: (message: string) => void,
  localOrder = false,
  learnerCheckpointIds: readonly string[] = [],
  specificationContext?: AssessmentSpecificationContext,
) {
  const reorderNodes = useMemo(
    () => (localOrder ? nodes : nodes.filter((node) => node.nodeType !== 'practice-auto')),
    [nodes, localOrder],
  );
  const reorderItems = useMemo(
    () =>
      reorderNodes.map((node) => ({
        id: node.id,
        draggable:
          !localOrder ||
          node.nodeType === 'lesson' ||
          node.nodeType === 'practice-question-set' ||
          (node.nodeType === 'checkpoint' && learnerCheckpointIds.includes(node.id)),
        dragId:
          localOrder && node.nodeType === 'practice-question-set' ? node.afterLessonId : undefined,
        name:
          node.nodeType === 'lesson'
            ? node.lesson.name
            : node.nodeType === 'checkpoint'
              ? node.assessment.name
              : (node.practiceNode?.name ?? 'Practice'),
      })),
    [reorderNodes, localOrder, learnerCheckpointIds],
  );
  const orderForMove = useCallback(
    (_ids: string[], id: string, index: number) =>
      localOrder
        ? localPathMoveOrder(reorderNodes, id, index, cards, links, specificationContext)
        : pathMoveOrder(reorderNodes, id, index, cards, links, specificationContext),
    [reorderNodes, cards, links, localOrder, specificationContext],
  );
  const keyboardTarget = useCallback(
    (id: string, delta: -1 | 1) =>
      localOrder
        ? localPathKeyboardTarget(reorderNodes, id, delta)
        : pathKeyboardTarget(reorderNodes, id, delta, cards, links, specificationContext),
    [reorderNodes, cards, links, localOrder, specificationContext],
  );
  const persistPathOrder = useCallback(
    async (ids: string[], id: string) => {
      const node = reorderNodes.find((item) => item.id === id);
      if (!node) return;
      if (localOrder) {
        if (node.nodeType === 'lesson') {
          await setLocalLessonOrder(
            courseId,
            ids.filter((candidate) =>
              reorderNodes.some((item) => item.id === candidate && item.nodeType === 'lesson'),
            ),
          );
        } else if (node.nodeType === 'checkpoint') {
          const anchor = ids
            .slice(0, ids.indexOf(id))
            .reverse()
            .find((candidate) =>
              reorderNodes.some((item) => item.id === candidate && item.nodeType === 'lesson'),
            );
          await updateCourseAssessment(
            id,
            { afterLessonId: anchor ?? null },
            { learnerOwnedOnly: true },
          );
        }
        return;
      }
      if (node.nodeType === 'lesson')
        await reorderLessons(
          courseId,
          ids.filter((candidate) =>
            reorderNodes.some((item) => item.id === candidate && item.nodeType === 'lesson'),
          ),
        );
      else {
        const anchor = ids
          .slice(0, ids.indexOf(id))
          .reverse()
          .find((candidate) =>
            reorderNodes.some((item) => item.id === candidate && item.nodeType === 'lesson'),
          );
        await moveAuthoredPathNode(
          node,
          lessons,
          lessons.findIndex((lesson) => lesson.id === anchor),
        );
      }
    },
    [reorderNodes, lessons, courseId, localOrder],
  );
  return usePathReorder({
    items: reorderItems,
    holdDelay: 350,
    enabled,
    onError,
    orderForMove,
    keyboardTarget,
    onReorder: persistPathOrder,
  });
}
