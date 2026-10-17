import { useCallback, useMemo } from 'react';
import type { PathNode } from '../../course/path';
import type { Card, Lesson, LessonCardLink } from '../../db/types';
import { reorderLessons } from '../../db/lessonRepository';
import { moveAuthoredPathNode, pathMoveOrder, pathKeyboardTarget } from './pathNodeReorder';
import { usePathReorder } from './useLessonPathReorder';

export function useCoursePathReorder(
  courseId: string,
  nodes: PathNode[],
  lessons: Lesson[],
  cards: Card[],
  links: LessonCardLink[],
  enabled: boolean,
  onError: (message: string) => void,
) {
  const reorderNodes = useMemo(
    () => nodes.filter((node) => node.nodeType !== 'practice-auto'),
    [nodes],
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
    (_ids: string[], id: string, index: number) =>
      pathMoveOrder(reorderNodes, id, index, cards, links),
    [reorderNodes, cards, links],
  );
  const keyboardTarget = useCallback(
    (id: string, delta: -1 | 1) => pathKeyboardTarget(reorderNodes, id, delta, cards, links),
    [reorderNodes, cards, links],
  );
  const persistPathOrder = useCallback(
    async (ids: string[], id: string) => {
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
    [reorderNodes, lessons, courseId],
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
