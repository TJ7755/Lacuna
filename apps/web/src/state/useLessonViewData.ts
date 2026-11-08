import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import type { Lesson } from '@lacuna/core/db/types';
import {
  useCourse,
  useLessonBackingDeck,
  useLessonCards,
  useLessons,
  useNotes,
} from './useCourseData';

export function useLessonViewData(courseId: string | undefined, lessonId: string | undefined) {
  const lesson = useLiveQuery<Lesson | null>(
    () => (lessonId ? db.lessons.get(lessonId).then((record) => record ?? null) : null),
    [lessonId],
  );
  const course = useCourse(courseId);
  const lessons = useLessons(courseId);
  const lessonCards = useLessonCards(lessonId);
  const notes = useNotes(lessonId);
  // Scheduling configuration and related question sets can resolve after the workspace.
  const lessonDeck = useLessonBackingDeck(courseId, lessonId);

  return {
    lesson,
    course,
    lessons,
    lessonCards,
    notes,
    lessonDeck,
  };
}
