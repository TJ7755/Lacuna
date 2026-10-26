import type { PathNode } from '../../course/path';
import { resolveAssessmentCoverage } from '../../course/assessmentCoverage';
import type { Card, Lesson, LessonCardLink } from '../../db/types';
import { updateCourseAssessment } from '../../db/assessmentRepository';
import { updatePracticeNode, updateQuestionSetPracticeNode } from '../../db/practiceNodeRepository';

export async function moveAuthoredPathNode(node: PathNode, lessons: Lesson[], anchorIndex: number) {
  const target = lessons[anchorIndex];
  if (node.nodeType === 'checkpoint') {
    if (node.assessment.kind === 'final') return;
    await updateCourseAssessment(node.id, { afterLessonId: target?.id ?? null });
  } else if (node.nodeType === 'practice-question-set') {
    if (!target) throw new Error('Question sets must follow a lesson.');
    await updateQuestionSetPracticeNode(node.id, target.id);
  } else if (node.nodeType === 'practice-manual') {
    await updatePracticeNode(node.id, { position: target?.orderIndex });
  }
}

/** Predict the stored, anchor-based order, including the path's stable ties. */
export function pathMoveOrder(
  nodes: PathNode[],
  id: string,
  targetIndex: number,
  cards: Card[],
  links: LessonCardLink[],
): string[] | null {
  const moving = nodes.find((node) => node.id === id);
  if (
    !moving ||
    moving.nodeType === 'practice-auto' ||
    (moving.nodeType === 'checkpoint' && moving.assessment.kind === 'final')
  )
    return null;
  const remaining = nodes.filter((node) => node.id !== id);
  const raw = [...remaining.slice(0, targetIndex), moving, ...remaining.slice(targetIndex)];
  const lessons = raw.flatMap((node) => (node.nodeType === 'lesson' ? [node.lesson] : []));
  const anchor =
    raw
      .slice(0, raw.indexOf(moving))
      .reverse()
      .find((node) => node.nodeType === 'lesson')?.id ?? null;
  if (moving.nodeType === 'practice-question-set' && !anchor) return null;
  const orderedLessons = lessons.map((lesson, index) => ({ ...lesson, orderIndex: index }));
  // Reordering a lesson must not make an existing assessment's scope invalid either.
  for (const node of nodes) {
    if (node.nodeType !== 'checkpoint') continue;
    const assessment =
      node.id === id ? { ...node.assessment, afterLessonId: anchor } : node.assessment;
    if (!resolveAssessmentCoverage(assessment, orderedLessons, cards, links).validation.valid)
      return null;
  }
  const placed = nodes
    .filter((node) => node.nodeType !== 'lesson')
    .map((node) => {
      let after: string | null = node.afterLessonId;
      if (node.id === id) after = anchor;
      else if (moving.nodeType === 'lesson' && node.nodeType === 'practice-manual') {
        after =
          orderedLessons
            .filter(
              (lesson) =>
                node.practiceNode?.position !== undefined &&
                lesson.orderIndex <= node.practiceNode.position,
            )
            .at(-1)?.id ?? null;
      }
      return { node, after };
    });
  const rank = (node: PathNode) =>
    node.nodeType === 'checkpoint'
      ? 0
      : node.nodeType === 'practice-manual'
        ? 1
        : node.nodeType === 'practice-question-set'
          ? 2
          : 3;
  const stamp = (node: PathNode) =>
    node.nodeType === 'checkpoint'
      ? (node.assessment.examDate ?? 0)
      : node.nodeType !== 'lesson'
        ? (node.practiceNode?.createdAt ?? 0)
        : 0;
  placed.sort((a, b) => rank(a.node) - rank(b.node) || stamp(a.node) - stamp(b.node));
  const at = (anchor: string | null) =>
    placed.filter((item) => item.after === anchor).map((item) => item.node.id);
  return [...at(null), ...lessons.flatMap((lesson) => [lesson.id, ...at(lesson.id)])];
}

export function pathKeyboardTarget(
  nodes: PathNode[],
  id: string,
  delta: -1 | 1,
  cards: Card[],
  links: LessonCardLink[],
): number {
  const node = nodes.find((node) => node.id === id);
  if (!node) return -1;
  const lessons = nodes.filter((item) => item.nodeType === 'lesson');
  const anchorIndex = lessons.findIndex(
    (lesson) => lesson.id === (node.nodeType === 'lesson' ? id : node.afterLessonId),
  );
  const next = anchorIndex + delta;
  const minimum = node.nodeType === 'lesson' || node.nodeType === 'practice-question-set' ? 0 : -1;
  if (next < minimum || next >= lessons.length) return -1;
  const remaining = nodes.filter((item) => item.id !== id);
  let target = next === -1 ? 0 : remaining.findIndex((item) => item.id === lessons[next].id) + 1;
  if (node.nodeType === 'lesson' && delta < 0) target -= 1;
  return pathMoveOrder(nodes, id, target, cards, links)?.indexOf(id) ?? -1;
}

/** Local lessons retain published indices; learner checkpoints retain lesson anchors. */
export function localPathMoveOrder(
  nodes: PathNode[],
  id: string,
  targetIndex: number,
  cards: Card[],
  links: LessonCardLink[],
): string[] | null {
  const moving = nodes.find((node) => node.id === id);
  if (!moving || (moving.nodeType !== 'lesson' && moving.nodeType !== 'checkpoint')) return null;
  const remaining = nodes.filter((node) => node.id !== id);
  const raw = [...remaining.slice(0, targetIndex), moving, ...remaining.slice(targetIndex)];
  const lessons = raw.flatMap((node) => (node.nodeType === 'lesson' ? [node.lesson] : []));
  const anchor =
    raw
      .slice(0, raw.indexOf(moving))
      .reverse()
      .find((node) => node.nodeType === 'lesson')?.id ?? null;
  if (
    moving.nodeType === 'checkpoint' &&
    !resolveAssessmentCoverage(
      { ...moving.assessment, afterLessonId: anchor },
      lessons,
      cards,
      links,
      lessons.map((lesson) => lesson.id),
    ).validation.valid
  )
    return null;
  const checkpoints = nodes
    .filter((node) => node.nodeType === 'checkpoint')
    .sort((left, right) => (left.assessment.examDate ?? 0) - (right.assessment.examDate ?? 0));
  const at = (lessonId: string | null) =>
    checkpoints
      .filter((node) => (node.id === id ? anchor : node.afterLessonId) === lessonId)
      .map((node) => node.id);
  return [...at(null), ...lessons.flatMap((lesson) => [lesson.id, ...at(lesson.id)])];
}

export function localPathKeyboardTarget(nodes: PathNode[], id: string, delta: -1 | 1): number {
  const node = nodes.find((item) => item.id === id);
  if (!node) return -1;
  const lessons = nodes.filter((item) => item.nodeType === 'lesson');
  const anchorIndex = lessons.findIndex(
    (lesson) => lesson.id === (node.nodeType === 'lesson' ? id : node.afterLessonId),
  );
  const next = anchorIndex + delta;
  if (next < (node.nodeType === 'lesson' ? 0 : -1) || next >= lessons.length) return -1;
  if (next === -1) return 0;
  const remaining = nodes.filter((item) => item.id !== id);
  const target = remaining.findIndex((item) => item.id === lessons[next].id);
  return target + (node.nodeType === 'lesson' && delta < 0 ? 0 : 1);
}
