import { useCallback, useMemo } from 'react';
import type { PathNode } from '../../course/path';
import type { Card, Lesson, LessonCardLink } from '../../db/types';
import { reorderLessons } from '../../db/lessonRepository';
import { setLocalLessonOrder } from '../../db/lessonOrder';
import { moveAuthoredPathNode, pathMoveOrder, pathKeyboardTarget } from './pathNodeReorder';
import { moveLessonIds, usePathReorder } from './useLessonPathReorder';

export function useCoursePathReorder(
  courseId: string,
  nodes: PathNode[],
  lessons: Lesson[],
  cards: Card[],
  links: LessonCardLink[],
  enabled: boolean,
  onError: (message: string) => void,
  localOrder = false,
) {
  const reorderNodes = useMemo(
    () =>
      nodes.filter((node) =>
        localOrder ? node.nodeType === 'lesson' : node.nodeType !== 'practice-auto',
      ),
    [nodes, localOrder],
  );
  const reorderItems = useMemo(
    () =>
      reorderNodes.map((node) => ({
        id: node.id,
        name:
          node.nodeType === 'lesson'
            ? node.lesson.name
            : node.nodeType === 'checkpoint'
              ? node.assessment.name
              : (node.practiceNode?.name ?? 'Practice'),
      })),
    [reorderNodes],
  );
  const orderForMove = useCallback(
    (ids: string[], id: string, index: number) =>
      localOrder
        ? moveLessonIds(ids, id, index)
        : pathMoveOrder(reorderNodes, id, index, cards, links),
    [reorderNodes, cards, links, localOrder],
  );
  const keyboardTarget = useCallback(
    (id: string, delta: -1 | 1) => pathKeyboardTarget(reorderNodes, id, delta, cards, links),
    [reorderNodes, cards, links],
  );
  const persistPathOrder = useCallback(
    async (ids: string[], id: string) => {
      if (localOrder) {
        await setLocalLessonOrder(courseId, ids);
        return;
      }
      const node = reorderNodes.find((item) => item.id === id);
      if (!node) return;
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
    keyboardTarget: localOrder ? undefined : keyboardTarget,
    onReorder: persistPathOrder,
  });
}
