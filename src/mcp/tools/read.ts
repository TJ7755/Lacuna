// The read/query tool group (Arc 2 §2.3): thin wrappers over src/db/read.ts, exposed to
// an MCP client with no consent gate beyond the implicit read grant (§2.4 — a later task
// wires actual grant checking; for now every read tool is always allowed). Each handler
// validates nothing itself — src/mcp/registry.ts's `validateAndRun` parses `rawInput`
// against `inputSchema` before the handler ever runs, so handlers receive typed input.

import { z } from 'zod';
import * as read from '../../db/read';
import { McpToolException, type ToolDefinition, type ToolResult } from '../types';

const courseIdSchema = z.string().describe('The id of the course to query.');
const limitSchema = z
  .number()
  .int()
  .positive()
  .optional()
  .describe('Maximum number of results to return. Omit for no limit.');

function ok<T>(data: T): ToolResult<T> {
  return { data };
}

function notFound(kind: string, id: string): never {
  throw new McpToolException({ kind: 'not_found', message: `${kind} "${id}" was not found.` });
}

const listCourses: ToolDefinition<Record<string, never>, Awaited<ReturnType<typeof read.listCourses>>> = {
  name: 'lacuna.list_courses',
  description: 'List every course in the local Lacuna database, ordered by creation time.',
  inputSchema: z.object({}),
  requiredScope: 'read',
  async handler() {
    return ok(await read.listCourses());
  },
};

const getCourseSchema = z.object({ courseId: courseIdSchema });
const getCourse: ToolDefinition<z.infer<typeof getCourseSchema>, NonNullable<Awaited<ReturnType<typeof read.getCourse>>>> = {
  name: 'lacuna.get_course',
  description: 'Fetch a single course by id.',
  inputSchema: getCourseSchema,
  requiredScope: 'read',
  async handler({ courseId }) {
    const course = await read.getCourse(courseId);
    if (!course) notFound('Course', courseId);
    return ok(course);
  },
};

const listLessonsSchema = z.object({ courseId: courseIdSchema });
const listLessons: ToolDefinition<z.infer<typeof listLessonsSchema>, Awaited<ReturnType<typeof read.listLessons>>> = {
  name: 'lacuna.list_lessons',
  description: "List a course's lessons, ordered by their position on the course path.",
  inputSchema: listLessonsSchema,
  requiredScope: 'read',
  async handler({ courseId }) {
    return ok(await read.listLessons(courseId));
  },
};

const listCardsSchema = z.object({
  courseId: courseIdSchema,
  lessonId: z
    .string()
    .optional()
    .describe(
      'If given, list only the cards taught in this lesson (primary plus linked cards). ' +
        'Otherwise list every card belonging to the course.',
    ),
});
const listCards: ToolDefinition<z.infer<typeof listCardsSchema>, Awaited<ReturnType<typeof read.listCardsForCourse>>> = {
  name: 'lacuna.list_cards',
  description: 'List cards belonging to a course, or scoped to a single lesson within it.',
  inputSchema: listCardsSchema,
  requiredScope: 'read',
  async handler({ courseId, lessonId }) {
    return ok(lessonId ? await read.listCardsForLesson(lessonId) : await read.listCardsForCourse(courseId));
  },
};

const getCardSchema = z.object({ cardId: z.string().describe('The id of the card to fetch.') });
const getCard: ToolDefinition<z.infer<typeof getCardSchema>, NonNullable<Awaited<ReturnType<typeof read.getCard>>>> = {
  name: 'lacuna.get_card',
  description: 'Fetch a single card by id.',
  inputSchema: getCardSchema,
  requiredScope: 'read',
  async handler({ cardId }) {
    const card = await read.getCard(cardId);
    if (!card) notFound('Card', cardId);
    return ok(card);
  },
};

const listDueCardsSchema = z.object({ courseId: courseIdSchema, limit: limitSchema });
const listDueCards: ToolDefinition<z.infer<typeof listDueCardsSchema>, Awaited<ReturnType<typeof read.listDueCards>>> = {
  name: 'lacuna.list_due_cards',
  description:
    'List the cards a study session would serve right now for a course: due reviews plus ' +
    "new cards admitted under the course's daily cap, ranked by the course's objective.",
  inputSchema: listDueCardsSchema,
  requiredScope: 'read',
  async handler({ courseId, limit }) {
    return ok(await read.listDueCards(courseId, limit));
  },
};

const getWeakCardsSchema = z.object({ courseId: courseIdSchema, limit: limitSchema });
const getWeakCards: ToolDefinition<z.infer<typeof getWeakCardsSchema>, Awaited<ReturnType<typeof read.getWeakCards>>> = {
  name: 'lacuna.get_weak_cards',
  description:
    "A course's weakest available cards: leeches first, then every other card ascending " +
    'by objective score, so the lowest-scoring, least-secured cards surface first.',
  inputSchema: getWeakCardsSchema,
  requiredScope: 'read',
  async handler({ courseId, limit }) {
    return ok(await read.getWeakCards(courseId, limit));
  },
};

const getCourseStatsSchema = z.object({ courseId: courseIdSchema });
const getCourseStats: ToolDefinition<z.infer<typeof getCourseStatsSchema>, NonNullable<Awaited<ReturnType<typeof read.getCourseStats>>>> = {
  name: 'lacuna.get_course_stats',
  description:
    "Bundled stats for a course: nearest-exam/mastery/due-count header stats plus the " +
    'study time forecast, both scoped to the course.',
  inputSchema: getCourseStatsSchema,
  requiredScope: 'read',
  async handler({ courseId }) {
    const stats = await read.getCourseStats(courseId);
    if (!stats) notFound('Course', courseId);
    return ok(stats);
  },
};

const listSequencesSchema = z.object({ courseId: courseIdSchema });
const listSequences: ToolDefinition<z.infer<typeof listSequencesSchema>, Awaited<ReturnType<typeof read.listSequences>>> = {
  name: 'lacuna.list_sequences',
  description: "List a course's sequences, ordered by creation time.",
  inputSchema: listSequencesSchema,
  requiredScope: 'read',
  async handler({ courseId }) {
    return ok(await read.listSequences(courseId));
  },
};

const getSequenceSchema = z.object({ sequenceId: z.string().describe('The id of the sequence to fetch.') });
const getSequence: ToolDefinition<z.infer<typeof getSequenceSchema>, NonNullable<Awaited<ReturnType<typeof read.getSequence>>>> = {
  name: 'lacuna.get_sequence',
  description: 'Fetch a single sequence by id.',
  inputSchema: getSequenceSchema,
  requiredScope: 'read',
  async handler({ sequenceId }) {
    const sequence = await read.getSequence(sequenceId);
    if (!sequence) notFound('Sequence', sequenceId);
    return ok(sequence);
  },
};

const listNotesSchema = z.object({ lessonId: z.string().describe('The id of the lesson whose notes to list.') });
const listNotes: ToolDefinition<z.infer<typeof listNotesSchema>, Awaited<ReturnType<typeof read.listNotes>>> = {
  name: 'lacuna.list_notes',
  description: "List a lesson's notes, ordered by their position within the lesson.",
  inputSchema: listNotesSchema,
  requiredScope: 'read',
  async handler({ lessonId }) {
    return ok(await read.listNotes(lessonId));
  },
};

const diagnosticsSummarySchema = z.object({
  courseId: z
    .string()
    .optional()
    .describe('If given, scope the record counts to this course. Otherwise return whole-database counts.'),
});
const diagnosticsSummary: ToolDefinition<z.infer<typeof diagnosticsSummarySchema>, Awaited<ReturnType<typeof read.diagnosticsSummary>>> = {
  name: 'lacuna.diagnostics_summary',
  description:
    'Record counts for a diagnostic summary: whole-database counts, or counts scoped to a ' +
    'single course when courseId is given.',
  inputSchema: diagnosticsSummarySchema,
  requiredScope: 'read',
  async handler({ courseId }) {
    return ok(await read.diagnosticsSummary(courseId));
  },
};

/** The read/query tool group, in the order they appear in Arc 2 §2.3's inventory. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a heterogeneous tool list is necessarily ToolDefinition<any, any>; each entry above is still checked against its own concrete Input/Output.
export const READ_TOOLS: readonly ToolDefinition<any, any>[] = [
  listCourses,
  getCourse,
  listLessons,
  listCards,
  getCard,
  listDueCards,
  getWeakCards,
  getCourseStats,
  listSequences,
  getSequence,
  listNotes,
  diagnosticsSummary,
];

// Also export individually for direct handler-level unit tests.
export {
  listCourses,
  getCourse,
  listLessons,
  listCards,
  getCard,
  listDueCards,
  getWeakCards,
  getCourseStats,
  listSequences,
  getSequence,
  listNotes,
  diagnosticsSummary,
};
