import { z } from 'zod';
import type { ToolContract } from '../types';

const courseIdSchema = z.string().describe('The id of the course to query.');
const limitSchema = z.number().int().positive().optional()
  .describe('Maximum number of results to return. Omit for no limit.');
const boundedLimitSchema = z.number().int().min(1).max(50);

export const listCoursesContract = {
  name: 'lacuna.list_courses',
  description: 'List every course in the local Lacuna database, ordered by creation time.',
  inputSchema: z.object({}),
  requiredScope: 'read',
} satisfies ToolContract;

export const findCourseContract = {
  name: 'lacuna.find_course',
  description:
    'Resolve a Course (sometimes called a deck) by id, exact name or partial name. Returns compact choices rather than full scheduling records.',
  inputSchema: z.object({
    query: z.string().trim().min(1).max(500).describe('Course id, exact name or partial name.'),
    limit: z.number().int().min(1).max(20).optional(),
  }).strict(),
  requiredScope: 'read',
} satisfies ToolContract;

export const searchCardsContract = {
  name: 'lacuna.search_cards',
  description:
    'Resolve one Course by name or id, then return compact, cursor-paginated Card content without FSRS state or review history.',
  inputSchema: z.object({
    course: z.string().trim().min(1).max(500).describe('Course id, exact name or unambiguous partial name.'),
    query: z.string().trim().max(1_000).optional().describe('Optional text matched against Card content, tags and Lesson name.'),
    limit: boundedLimitSchema.optional(),
    cursor: z.string().max(100).optional(),
    includePayload: z.boolean().optional().describe('Include structured numeric or working payloads. Off by default.'),
  }).strict(),
  requiredScope: 'read',
} satisfies ToolContract;

export const getCourseContract = {
  name: 'lacuna.get_course',
  description: 'Fetch a single course by id.',
  inputSchema: z.object({ courseId: courseIdSchema }),
  requiredScope: 'read',
} satisfies ToolContract;

export const listLessonsContract = {
  name: 'lacuna.list_lessons',
  description: "List a course's lessons, ordered by their position on the course path.",
  inputSchema: z.object({ courseId: courseIdSchema }),
  requiredScope: 'read',
} satisfies ToolContract;

export const listCourseAssessmentsContract = {
  name: 'lacuna.list_course_assessments',
  description: "List a course's assessments with full persisted semantics and resolved scope.",
  inputSchema: z.object({ courseId: courseIdSchema }),
  requiredScope: 'read',
} satisfies ToolContract;

export const getCourseAssessmentContract = {
  name: 'lacuna.get_course_assessment',
  description: 'Fetch one assessment with its exact resolved lessons, cards and validation state.',
  inputSchema: z.object({
    assessmentId: z.string().describe('The id of the assessment to fetch.'),
  }),
  requiredScope: 'read',
} satisfies ToolContract;

export const listCardsContract = {
  name: 'lacuna.list_cards',
  description: 'List cards belonging to a course, or scoped to a single lesson within it.',
  inputSchema: z.object({
    courseId: courseIdSchema,
    lessonId: z.string().optional().describe(
      'If given, list only the cards taught in this lesson (primary plus linked cards). ' +
      'Otherwise list every card belonging to the course.',
    ),
  }),
  requiredScope: 'read',
} satisfies ToolContract;

export const getCardContract = {
  name: 'lacuna.get_card',
  description: 'Fetch a single card by id.',
  inputSchema: z.object({ cardId: z.string().describe('The id of the card to fetch.') }),
  requiredScope: 'read',
} satisfies ToolContract;

export const listDueCardsContract = {
  name: 'lacuna.list_due_cards',
  description:
    'List the cards a study session would serve right now for a course: due reviews plus ' +
    "new cards admitted under the course's daily cap, ranked by the course's objective.",
  inputSchema: z.object({ courseId: courseIdSchema, limit: limitSchema }),
  requiredScope: 'read',
} satisfies ToolContract;

export const getWeakCardsContract = {
  name: 'lacuna.get_weak_cards',
  description:
    "A course's weakest available cards: leeches first, then every other card ascending " +
    'by objective score, so the lowest-scoring, least-secured cards surface first.',
  inputSchema: z.object({ courseId: courseIdSchema, limit: limitSchema }),
  requiredScope: 'read',
} satisfies ToolContract;

export const getCourseStatsContract = {
  name: 'lacuna.get_course_stats',
  description:
    "Bundled stats for a course: nearest-exam/mastery/due-count header stats plus the " +
    'study time forecast, both scoped to the course.',
  inputSchema: z.object({ courseId: courseIdSchema }),
  requiredScope: 'read',
} satisfies ToolContract;

export const listSequencesContract = {
  name: 'lacuna.list_sequences',
  description: "List a course's sequences, ordered by creation time.",
  inputSchema: z.object({ courseId: courseIdSchema }),
  requiredScope: 'read',
} satisfies ToolContract;

export const getSequenceContract = {
  name: 'lacuna.get_sequence',
  description: 'Fetch a single sequence by id.',
  inputSchema: z.object({ sequenceId: z.string().describe('The id of the sequence to fetch.') }),
  requiredScope: 'read',
} satisfies ToolContract;

export const listOcclusionsContract = {
  name: 'lacuna.list_occlusions',
  description: "List a course's image occlusions, ordered by creation time.",
  inputSchema: z.object({ courseId: z.string().describe('The id of the course whose occlusions to list.') }),
  requiredScope: 'read',
} satisfies ToolContract;

export const getOcclusionContract = {
  name: 'lacuna.get_occlusion',
  description:
    'Fetch a single image occlusion by id, including every region and its fractional coordinates.',
  inputSchema: z.object({ occlusionId: z.string().describe('The id of the occlusion to fetch.') }),
  requiredScope: 'read',
} satisfies ToolContract;

export const listNotesContract = {
  name: 'lacuna.list_notes',
  description: "List a lesson's notes, ordered by their position within the lesson.",
  inputSchema: z.object({ lessonId: z.string().describe('The id of the lesson whose notes to list.') }),
  requiredScope: 'read',
} satisfies ToolContract;

export const diagnosticsSummaryContract = {
  name: 'lacuna.diagnostics_summary',
  description:
    'Record counts for a diagnostic summary: whole-database counts, or counts scoped to a ' +
    'single course when courseId is given.',
  inputSchema: z.object({
    courseId: z.string().optional().describe(
      'If given, scope the record counts to this course. Otherwise return whole-database counts.',
    ),
  }),
  requiredScope: 'read',
} satisfies ToolContract;

export const READ_TOOL_CONTRACTS = [
  listCoursesContract,
  findCourseContract,
  getCourseContract,
  listCourseAssessmentsContract,
  getCourseAssessmentContract,
  listLessonsContract,
  listCardsContract,
  searchCardsContract,
  getCardContract,
  listDueCardsContract,
  getWeakCardsContract,
  getCourseStatsContract,
  listSequencesContract,
  getSequenceContract,
  listOcclusionsContract,
  getOcclusionContract,
  listNotesContract,
  diagnosticsSummaryContract,
] as const satisfies readonly ToolContract[];
