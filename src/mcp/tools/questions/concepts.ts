import type { z } from 'zod';
import {
  createConcept as repoCreateConcept,
  deleteConcept as repoDeleteConcept,
  listConcepts as repoListConcepts,
  snapshotConcept as repoSnapshotConcept,
  updateConcept as repoUpdateConcept,
} from '../../../questions/repository';
import {
  createConceptContract,
  deleteConceptContract,
  listConceptsContract,
  updateConceptContract,
} from '../../contracts/questions';
import { McpToolException, type ToolDefinition } from '../../types';
import { notFound, ok, requireCourse } from './shared';

export const listConcepts: ToolDefinition<
  z.infer<typeof listConceptsContract.inputSchema>,
  Awaited<ReturnType<typeof repoListConcepts>>
> = {
  ...listConceptsContract,
  async handler({ courseId }) {
    await requireCourse(courseId);
    return ok(await repoListConcepts(courseId));
  },
};

export const createConcept: ToolDefinition<
  z.infer<typeof createConceptContract.inputSchema>,
  Awaited<ReturnType<typeof repoCreateConcept>>
> = {
  ...createConceptContract,
  async handler({ courseId, name }) {
    await requireCourse(courseId);
    return ok(await repoCreateConcept(courseId, name));
  },
};

export const updateConcept: ToolDefinition<
  z.infer<typeof updateConceptContract.inputSchema>,
  Awaited<ReturnType<typeof repoUpdateConcept>>
> = {
  ...updateConceptContract,
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

export const deleteConcept: ToolDefinition<z.infer<typeof deleteConceptContract.inputSchema>, { id: string }> = {
  ...deleteConceptContract,
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
