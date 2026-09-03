// The read/query tool group (Arc 2 §2.3): thin wrappers over src/db/read.ts, exposed to
// an MCP client with no consent gate beyond the implicit read grant (§2.4 — a later task
// wires actual grant checking; for now every read tool is always allowed). Each handler
// validates nothing itself — src/mcp/registry.ts's `validateAndRun` parses `rawInput`
// against `inputSchema` before the handler ever runs, so handlers receive typed input.

import type { z } from 'zod';
import * as read from '../../db/read';
import { searchCardsInScope } from '../../db/search';
import {
  diagnosticsSummaryContract,
  findCourseContract,
  getCardContract,
  getCourseAssessmentContract,
  getCourseContract,
  getCourseStatsContract,
  getOcclusionContract,
  getSequenceContract,
  getWeakCardsContract,
  listCardsContract,
  listCourseAssessmentsContract,
  listCoursesContract,
  listDueCardsContract,
  listLessonsContract,
  listNotesContract,
  listOcclusionsContract,
  listSequencesContract,
  searchCardsContract,
} from '../contracts/read';
import { courseChoiceMessage, findCourseMatches } from '../courseLookup';
import { McpToolException, type ToolDefinition, type ToolResult } from '../types';

function ok<T>(data: T): ToolResult<T> {
  return { data };
}

function notFound(kind: string, id: string): never {
  throw new McpToolException({ kind: 'not_found', message: `${kind} "${id}" was not found.` });
}

const listCourses: ToolDefinition<Record<string, never>, Awaited<ReturnType<typeof read.listCourses>>> = {
  ...listCoursesContract,
  async handler() {
    return ok(await read.listCourses());
  },
};

const findCourse: ToolDefinition<z.infer<typeof findCourseContract.inputSchema>, {
  matches: Array<{
    courseId: string;
    name: string;
    archived: boolean;
    lessonCount: number;
    cardCount: number;
  }>;
}> = {
  ...findCourseContract,
  async handler({ query, limit = 10 }) {
    const matches = (await findCourseMatches(query)).slice(0, limit);
    return ok({
      matches: await Promise.all(matches.map(async (course) => {
        const [lessonCount, cardCount] = await Promise.all([
          read.countLessonsForCourse(course.id),
          read.countCardsForCourse(course.id),
        ]);
        return {
          courseId: course.id,
          name: course.name,
          archived: course.archived === true,
          lessonCount,
          cardCount,
        };
      })),
    });
  },
};

interface CompactCardResult {
  course: { courseId: string; name: string; archived: boolean };
  total: number;
  topics: string[];
  cards: Array<{
    cardId: string;
    type: string;
    front: string;
    back: string;
    tags: string[];
    lesson?: string;
    payload?: unknown;
  }>;
  nextCursor?: string;
}

function normaliseCursorQuery(query: string): string {
  return query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
}

async function cardCursorScope(courseId: string, query: string): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([courseId, normaliseCursorQuery(query)]));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function parseCardCursor(cursor: string | undefined, scope: string): number {
  if (cursor === undefined) return 0;
  const match = /^cards-v2\.([a-f0-9]{64})\.([0-9a-z]+)$/.exec(cursor);
  const offset = match && match[1] === scope ? Number.parseInt(match[2], 36) : Number.NaN;
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new McpToolException({ kind: 'validation', message: 'The Card cursor is invalid or expired.' });
  }
  return offset;
}

const searchCards: ToolDefinition<z.infer<typeof searchCardsContract.inputSchema>, CompactCardResult> = {
  ...searchCardsContract,
  async handler({ course: query, query: cardQuery = '', limit = 20, cursor, includePayload = false }) {
    const matches = await findCourseMatches(query);
    if (matches.length !== 1) {
      throw new McpToolException({
        kind: matches.length === 0 ? 'not_found' : 'conflict',
        message: courseChoiceMessage(query, matches),
      });
    }
    const course = matches[0];
    const [cards, lessons] = await Promise.all([
      read.listCardRecordsForCourse(course.id),
      read.listLessons(course.id),
    ]);
    const hits = cardQuery === ''
      ? cards.map((card) => ({ card, lesson: lessons.find((lesson) => lesson.id === card.primaryLessonId) }))
      : searchCardsInScope(cardQuery, { cards, courses: [course], lessons });
    const cursorScope = await cardCursorScope(course.id, cardQuery);
    const offset = parseCardCursor(cursor, cursorScope);
    if (offset > hits.length) {
      throw new McpToolException({ kind: 'validation', message: 'The Card cursor is invalid or expired.' });
    }
    const page = hits.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    const topics = [...new Set(cards.flatMap((card) => card.tags ?? []))]
      .sort((left, right) => left.localeCompare(right))
      .slice(0, 20);
    return ok({
      course: { courseId: course.id, name: course.name, archived: course.archived === true },
      total: hits.length,
      topics,
      cards: page.map(({ card, lesson }) => ({
        cardId: card.id,
        type: card.type,
        front: card.front,
        back: card.back,
        tags: card.tags ?? [],
        ...(lesson ? { lesson: lesson.name } : {}),
        ...(includePayload && card.payload ? { payload: card.payload } : {}),
      })),
      ...(nextOffset < hits.length
        ? { nextCursor: `cards-v2.${cursorScope}.${nextOffset.toString(36)}` }
        : {}),
    });
  },
};

const getCourse: ToolDefinition<z.infer<typeof getCourseContract.inputSchema>, NonNullable<Awaited<ReturnType<typeof read.getCourse>>>> = {
  ...getCourseContract,
  async handler({ courseId }) {
    const course = await read.getCourse(courseId);
    if (!course) notFound('Course', courseId);
    return ok(course);
  },
};

const listLessons: ToolDefinition<z.infer<typeof listLessonsContract.inputSchema>, Awaited<ReturnType<typeof read.listLessons>>> = {
  ...listLessonsContract,
  async handler({ courseId }) {
    return ok(await read.listLessons(courseId));
  },
};

const listCourseAssessments: ToolDefinition<
  z.infer<typeof listCourseAssessmentsContract.inputSchema>,
  Awaited<ReturnType<typeof read.listCourseAssessmentDetails>>
> = {
  ...listCourseAssessmentsContract,
  async handler({ courseId }) {
    return ok(await read.listCourseAssessmentDetails(courseId));
  },
};

const getCourseAssessment: ToolDefinition<
  z.infer<typeof getCourseAssessmentContract.inputSchema>,
  NonNullable<Awaited<ReturnType<typeof read.getCourseAssessmentDetails>>>
> = {
  ...getCourseAssessmentContract,
  async handler({ assessmentId }) {
    const assessment = await read.getCourseAssessmentDetails(assessmentId);
    if (!assessment) notFound('Course assessment', assessmentId);
    return ok(assessment);
  },
};

const listCards: ToolDefinition<z.infer<typeof listCardsContract.inputSchema>, Awaited<ReturnType<typeof read.listCardsForCourse>>> = {
  ...listCardsContract,
  async handler({ courseId, lessonId }) {
    return ok(lessonId ? await read.listCardsForLesson(lessonId) : await read.listCardsForCourse(courseId));
  },
};

const getCard: ToolDefinition<z.infer<typeof getCardContract.inputSchema>, NonNullable<Awaited<ReturnType<typeof read.getCard>>>> = {
  ...getCardContract,
  async handler({ cardId }) {
    const card = await read.getCard(cardId);
    if (!card) notFound('Card', cardId);
    return ok(card);
  },
};

const listDueCards: ToolDefinition<z.infer<typeof listDueCardsContract.inputSchema>, Awaited<ReturnType<typeof read.listDueCards>>> = {
  ...listDueCardsContract,
  async handler({ courseId, limit }) {
    return ok(await read.listDueCards(courseId, limit));
  },
};

const getWeakCards: ToolDefinition<z.infer<typeof getWeakCardsContract.inputSchema>, Awaited<ReturnType<typeof read.getWeakCards>>> = {
  ...getWeakCardsContract,
  async handler({ courseId, limit }) {
    return ok(await read.getWeakCards(courseId, limit));
  },
};

const getCourseStats: ToolDefinition<z.infer<typeof getCourseStatsContract.inputSchema>, NonNullable<Awaited<ReturnType<typeof read.getCourseStats>>>> = {
  ...getCourseStatsContract,
  async handler({ courseId }) {
    const stats = await read.getCourseStats(courseId);
    if (!stats) notFound('Course', courseId);
    return ok(stats);
  },
};

const listSequences: ToolDefinition<z.infer<typeof listSequencesContract.inputSchema>, Awaited<ReturnType<typeof read.listSequences>>> = {
  ...listSequencesContract,
  async handler({ courseId }) {
    return ok(await read.listSequences(courseId));
  },
};

const getSequence: ToolDefinition<z.infer<typeof getSequenceContract.inputSchema>, NonNullable<Awaited<ReturnType<typeof read.getSequence>>>> = {
  ...getSequenceContract,
  async handler({ sequenceId }) {
    const sequence = await read.getSequence(sequenceId);
    if (!sequence) notFound('Sequence', sequenceId);
    return ok(sequence);
  },
};

const listOcclusions: ToolDefinition<z.infer<typeof listOcclusionsContract.inputSchema>, Awaited<ReturnType<typeof read.listOcclusions>>> = {
  ...listOcclusionsContract,
  async handler({ courseId }) {
    return ok(await read.listOcclusions(courseId));
  },
};

const getOcclusion: ToolDefinition<z.infer<typeof getOcclusionContract.inputSchema>, NonNullable<Awaited<ReturnType<typeof read.getOcclusion>>>> = {
  ...getOcclusionContract,
  async handler({ occlusionId }) {
    const occlusion = await read.getOcclusion(occlusionId);
    if (!occlusion) notFound('Occlusion', occlusionId);
    return ok(occlusion);
  },
};

const listNotes: ToolDefinition<z.infer<typeof listNotesContract.inputSchema>, Awaited<ReturnType<typeof read.listNotes>>> = {
  ...listNotesContract,
  async handler({ lessonId }) {
    return ok(await read.listNotes(lessonId));
  },
};

const diagnosticsSummary: ToolDefinition<z.infer<typeof diagnosticsSummaryContract.inputSchema>, Awaited<ReturnType<typeof read.diagnosticsSummary>>> = {
  ...diagnosticsSummaryContract,
  async handler({ courseId }) {
    return ok(await read.diagnosticsSummary(courseId));
  },
};

/** The read/query tool group, in the order they appear in Arc 2 §2.3's inventory. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a heterogeneous tool list is necessarily ToolDefinition<any, any>; each entry above is still checked against its own concrete Input/Output.
export const READ_TOOLS: readonly ToolDefinition<any, any>[] = [
  listCourses,
  findCourse,
  getCourse,
  listCourseAssessments,
  getCourseAssessment,
  listLessons,
  listCards,
  searchCards,
  getCard,
  listDueCards,
  getWeakCards,
  getCourseStats,
  listSequences,
  getSequence,
  listOcclusions,
  getOcclusion,
  listNotes,
  diagnosticsSummary,
];

// Also export individually for direct handler-level unit tests.
export {
  listCourses,
  findCourse,
  getCourse,
  listCourseAssessments,
  getCourseAssessment,
  listLessons,
  listCards,
  searchCards,
  getCard,
  listDueCards,
  getWeakCards,
  getCourseStats,
  listSequences,
  getSequence,
  listOcclusions,
  getOcclusion,
  listNotes,
  diagnosticsSummary,
};
