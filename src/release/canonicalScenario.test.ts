import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { buildCourseShareCode, decodeShare, summariseShare } from '../db/share';
import { exportDatabase, importBackup, readBackupFile } from '../db/portability';
import { getTool, validateAndRun } from '../mcp/registry';

const context = { agentId: 'release-scenario', grant: null };

async function runTool<T>(name: string, input: unknown): Promise<T> {
  const tool = getTool(name);
  if (!tool) throw new Error(`Release scenario references unknown MCP tool "${name}".`);
  const result = await validateAndRun(tool, input, context);
  if (!result.ok) throw new Error(`${name} failed: [${result.error.kind}] ${result.error.message}`);
  return result.result.data as T;
}

async function clearDatabase(): Promise<void> {
  await Promise.all(db.tables.map((table) => table.clear()));
}

describe('canonical release scenario', () => {
  beforeAll(clearDatabase);
  afterAll(async () => {
    await clearDatabase();
    db.close();
  });

  it('builds through MCP, previews without mutation, restores exactly and survives reload', async () => {
    const course = await runTool<{ id: string }>('lacuna.create_course', {
      name: 'Canonical release course',
      description: 'Disposable §2.13 release evidence.',
    });
    const lessonA = await runTool<{ id: string }>('lacuna.create_lesson', {
      courseId: course.id,
      name: 'Foundations',
    });
    const lessonB = await runTool<{ id: string }>('lacuna.create_lesson', {
      courseId: course.id,
      name: 'Applications',
    });
    await runTool('lacuna.create_note', { lessonId: lessonA.id, name: 'Overview', content: 'First note.' });
    await runTool('lacuna.create_note', { lessonId: lessonB.id, name: 'Details', content: 'Second note.' });
    await runTool('lacuna.create_card', {
      courseId: course.id,
      lessonId: lessonA.id,
      type: 'front_back',
      front: 'Question one',
      back: 'Answer one',
    });
    await runTool('lacuna.create_card', {
      courseId: course.id,
      lessonId: lessonB.id,
      type: 'cloze',
      front: 'A {{c1::canonical}} cloze.',
      back: '',
    });
    await runTool('lacuna.create_card', {
      courseId: course.id,
      lessonId: lessonB.id,
      type: 'front_back',
      front: 'Question three',
      back: 'Answer three',
    });
    await runTool('lacuna.create_card', {
      courseId: course.id,
      type: 'front_back',
      front: 'Question-bank item',
      back: 'Unassigned answer',
    });

    const [lessons, cards, notesA, notesB] = await Promise.all([
      runTool<unknown[]>('lacuna.list_lessons', { courseId: course.id }),
      runTool<unknown[]>('lacuna.list_cards', { courseId: course.id }),
      runTool<unknown[]>('lacuna.list_notes', { lessonId: lessonA.id }),
      runTool<unknown[]>('lacuna.list_notes', { lessonId: lessonB.id }),
    ]);
    expect({ lessons: lessons.length, notes: notesA.length + notesB.length, cards: cards.length })
      .toEqual({ lessons: 2, notes: 2, cards: 4 });

    const sharePayload = await decodeShare(await buildCourseShareCode(course.id));
    expect(summariseShare(sharePayload)).toMatchObject({
      kind: 'course',
      lessonCount: 2,
      noteCount: 2,
      cardCount: 3,
    });

    const backup = await exportDatabase();
    expect(backup.lessons).toHaveLength(2);
    expect(backup.decks.length).not.toBe(backup.lessons?.length);
    const beforePreview = await runTool<unknown[]>('lacuna.list_courses', {});
    const preview = await readBackupFile(new File([JSON.stringify(backup)], 'canonical-lacuna-backup.json', {
      type: 'application/json',
    }));
    expect({ lessons: preview.lessons?.length, cards: preview.cards.length })
      .toEqual({ lessons: 2, cards: 4 });
    expect(await runTool<unknown[]>('lacuna.list_courses', {})).toHaveLength(beforePreview.length);

    await runTool('lacuna.create_course', { name: 'State that replace must remove' });
    await importBackup(backup, 'replace');
    expect((await runTool<Array<{ id: string }>>('lacuna.list_courses', {})).map((entry) => entry.id))
      .toEqual([course.id]);

    db.close();
    await db.open();
    expect(await runTool<unknown[]>('lacuna.list_lessons', { courseId: course.id })).toHaveLength(2);
    expect(await runTool<unknown[]>('lacuna.list_cards', { courseId: course.id })).toHaveLength(4);
  });
});
