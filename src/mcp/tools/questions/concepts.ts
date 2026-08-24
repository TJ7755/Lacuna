import { z } from 'zod';
import {
  createConcept as repoCreateConcept,
  deleteConcept as repoDeleteConcept,
  listConcepts as repoListConcepts,
  snapshotConcept as repoSnapshotConcept,
  updateConcept as repoUpdateConcept,
} from '../../../questions/repository';
import { McpToolException, type ToolDefinition } from '../../types';
import {
  authoredTextSchema,
  conceptIdSchema,
  courseIdSchema,
  notFound,
  ok,
  requireCourse,
} from './shared';

const listConceptsSchema = z.object({ courseId: courseIdSchema }).strict();
export const listConcepts: ToolDefinition<
  z.infer<typeof listConceptsSchema>,
  Awaited<ReturnType<typeof repoListConcepts>>
> = {
  name: 'lacuna.list_concepts',
  description: "List a Course's Concepts, ordered by name.",
  inputSchema: listConceptsSchema,
  requiredScope: 'read',
  async handler({ courseId }) {
    await requireCourse(courseId);
    return ok(await repoListConcepts(courseId));
  },
};

const createConceptSchema = z
  .object({
    courseId: courseIdSchema,
    name: authoredTextSchema.describe('The stable Concept name.'),
  })
  .strict();
export const createConcept: ToolDefinition<
  z.infer<typeof createConceptSchema>,
  Awaited<ReturnType<typeof repoCreateConcept>>
> = {
  name: 'lacuna.create_concept',
  description: 'Create a Concept that Cards and Questions may reference.',
  inputSchema: createConceptSchema,
  requiredScope: 'write',
  async handler({ courseId, name }) {
    await requireCourse(courseId);
    return ok(await repoCreateConcept(courseId, name));
  },
};

const updateConceptSchema = z
  .object({
    conceptId: conceptIdSchema,
    name: authoredTextSchema.optional(),
  })
  .strict()
  .refine((input) => input.name !== undefined, {
    message: 'Provide at least one Concept change.',
  });
export const updateConcept: ToolDefinition<
  z.infer<typeof updateConceptSchema>,
  Awaited<ReturnType<typeof repoUpdateConcept>>
> = {
  name: 'lacuna.update_concept',
  description: "Update a Concept's display name. Migration provenance remains human-reviewed.",
  inputSchema: updateConceptSchema,
  requiredScope: 'write',
  async handler({ conceptId, ...changes }) {
    try {
      return ok(await repoUpdateConcept(conceptId, changes));
    } catch (error) {
      if (error instanceof Error && error.message === 'Concept not found.') {
        notFound('Concept', conceptId);
      }
      throw error;
    }
  },
};

const deleteConceptSchema = z.object({ conceptId: conceptIdSchema }).strict();
export const deleteConcept: ToolDefinition<z.infer<typeof deleteConceptSchema>, { id: string }> = {
  name: 'lacuna.delete_concept',
  description: 'Delete an unreferenced Concept. Refuses Concepts still used by a Card or Question.',
  inputSchema: deleteConceptSchema,
  requiredScope: 'destructive',
  async handler({ conceptId }) {
    const snapshot = await repoSnapshotConcept(conceptId);
    if (!snapshot) notFound('Concept', conceptId);
    try {
      await repoDeleteConcept(conceptId);
    } catch (error) {
      throw new McpToolException({
        kind: 'conflict',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return {
      data: { id: conceptId },
      undo: { kind: 'restoreConcept', snapshot },
    };
  },
};
