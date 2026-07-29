import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import {
  createCourse,
  createCourseAssessment,
  createLesson,
  createLessonCard,
  createNote,
  createSequence,
} from '../../db/repository';
import { GLOBAL_SCOPE_KEY } from '../grants';
import { resolveToolScopes } from './scopeResolver';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('resolveToolScopes', () => {
  it('resolves ID-only card, lesson, note and sequence tools to their owning course', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Q', 'A');
    const note = await createNote(lesson.id, 'Notes', 'Body');
    const sequence = await createSequence(course.id, lesson.id, 'Order', [{ id: 'one', value: 'One' }]);
    const assessment = await createCourseAssessment(course.id, 'Paper 1', Date.now() + 1000, {
      afterLessonId: lesson.id,
      coverageMode: 'prefix',
    });

    for (const input of [
      { cardId: card.id },
      { lessonId: lesson.id },
      { noteId: note.id },
      { sequenceId: sequence.id },
      { assessmentId: assessment.id },
    ]) {
      const outcome = await resolveToolScopes(input);
      expect(outcome).toEqual({ ok: true, targets: [{ courseId: course.id, label: 'Biology' }] });
    }
  });

  it('rejects a cross-course bulk card action rather than collapsing it into one grant', async () => {
    const first = await createCourse('First');
    const second = await createCourse('Second');
    const firstCard = await createLessonCard(first.id, (await createLesson(first.id, 'One')).id, 'front_back', '1', '1');
    const secondCard = await createLessonCard(second.id, (await createLesson(second.id, 'Two')).id, 'front_back', '2', '2');
    const outcome = await resolveToolScopes({ ids: [firstCard.id, secondCard.id] });
    expect(outcome).toEqual({
      ok: false,
      error: { kind: 'conflict', message: 'A single MCP tool call cannot target multiple courses.' },
    });
  });

  it('uses global scope only when the tool input has no owned entity', async () => {
    expect(await resolveToolScopes({})).toEqual({
      ok: true,
      targets: [{ courseId: GLOBAL_SCOPE_KEY, label: 'All Lacuna data' }],
    });
  });

  it('fails before consent when an ID-only target does not exist', async () => {
    expect(await resolveToolScopes({ cardId: 'missing' })).toEqual({
      ok: false,
      error: { kind: 'not_found', message: 'Card "missing" was not found.' },
    });
  });

  it('rejects a missing explicit course id rather than treating it as global scope', async () => {
    for (const courseId of ['', '   ', null]) {
      expect(await resolveToolScopes({ courseId })).toEqual({
        ok: false,
        error: { kind: 'validation', message: 'courseId must be a non-empty string.' },
      });
    }
  });

  it('rejects an explicit course that conflicts with an owned entity', async () => {
    const first = await createCourse('First');
    const second = await createCourse('Second');
    const lesson = await createLesson(second.id, 'Two');
    expect(await resolveToolScopes({ courseId: first.id, lessonId: lesson.id })).toEqual({
      ok: false,
      error: { kind: 'conflict', message: `The supplied entity does not belong to course "${first.id}".` },
    });
  });
});
