import {
  QuestionSetAttemptRevisionConflictError,
  saveQuestionSetResponseDraft,
  saveQuestionSetAttemptPosition,
  saveQuestionSetMarking,
  submitQuestionSetPaper,
  submitPracticeQuestion,
  completeQuestionSetAttempt,
  recordQuestionSetAssistance,
  type SaveQuestionSetMarkingInput,
} from '../../questions/questionSetAttemptRepository';
import { flattenQuestionSet } from '../../questions/questionSetAuthoring';
import {
  feedbackAvailable,
  type QuestionSetResponseValue,
} from '@lacuna/core/questions/questionSetAttempts';
import { summariseSelfMarking } from '@lacuna/core/questions/questionSets';
import { recordUsageAction } from '../../usage/actions';
import type { QuestionSetAttemptRecord } from '@lacuna/core/questions/questionSetAttempts';

type Command = (record: QuestionSetAttemptRecord) => Promise<QuestionSetAttemptRecord>;

type Loader = (id: string) => Promise<QuestionSetAttemptRecord | null>;

/**
 * One revision owner per open attempt. Failed writes stop the queue instead of guessing a revision.
 * Background marking may also write the attempt: the session adopts those revisions while idle, and
 * a command that meets one re-runs once against the latest record, since commands derive their
 * write from the record they are given.
 */
export class QuestionSetAttemptSession {
  snapshot: {
    record: QuestionSetAttemptRecord;
    pending: number;
    error: Error | null;
    draftVersion: number;
    saving: boolean;
    formDirty: boolean;
    reflectionDirty: boolean;
    acting: boolean;
    actionError: string;
  };
  private drafts = new Map<string, QuestionSetResponseValue>();
  private flushing: Promise<void> | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private failed: Command[] = [];
  private listeners = new Set<() => void>();

  constructor(
    record: QuestionSetAttemptRecord,
    private load?: Loader,
  ) {
    this.snapshot = {
      record,
      pending: 0,
      error: null,
      draftVersion: 0,
      saving: false,
      formDirty: false,
      reflectionDirty: false,
      acting: false,
      actionError: '',
    };
  }
  get unfinished() {
    return this.snapshot.formDirty || this.snapshot.reflectionDirty;
  }
  get dirty() {
    return this.drafts.size > 0 || this.snapshot.pending > 0 || this.unfinished;
  }
  get practice() {
    const { record: attempt, pending, acting, error } = this.snapshot;
    const allNodes = flattenQuestionSet(attempt.receipt);
    const nodes = allNodes.filter((node) => node.node.answer);
    const index = nodes.findIndex((node) => node.id === attempt.activeNodeId);
    const active = nodes[index];
    const questionId = active.parentIds[0] ?? active.id;
    const marking = feedbackAvailable(attempt, questionId);
    const criteria = nodes.flatMap((node) =>
      feedbackAvailable(attempt, node.parentIds[0] ?? node.id)
        ? node.node.answer!.allocations.map((allocation) => ({ nodeId: node.id, allocation }))
        : [],
    );
    const criterion =
      criteria.find((row) => row.allocation.id === attempt.activeAllocationId) ??
      criteria.find((row) => row.nodeId === active.id);
    const criterionIndex = criteria.findIndex(
      (row) => row.allocation.id === criterion?.allocation.id,
    );
    const currentMarked = attempt.decisions.some(
      (row) => row.allocationId === criterion?.allocation.id && row.status === 'awarded',
    );
    const nextCriterion =
      criteria[criterionIndex + 1] ??
      criteria.find(
        (row) =>
          !attempt.decisions.some(
            (decision) =>
              decision.allocationId === row.allocation.id && decision.status === 'awarded',
          ),
      );
    const nextPart = nodes[index + 1];
    const advancePart = Boolean(
      !marking &&
      nextPart &&
      (attempt.mode === 'paper' || (nextPart.parentIds[0] ?? nextPart.id) === questionId),
    );
    const summary = summariseSelfMarking(attempt.receipt, attempt.decisions);
    const continuing = Boolean(nextCriterion && criteria.length > 1);
    const blocked = this.unfinished || pending > 0 || acting || Boolean(error);
    const actionBlocked = this.unfinished || acting || Boolean(error);
    const jevCount = attempt.decisions.filter((decision) => decision.markedBy?.by === 'jev').length;
    return {
      allNodes,
      nodes,
      index,
      active,
      questionId,
      marking,
      criteria,
      criterion,
      criterionIndex,
      nextCriterion,
      nextPart,
      advancePart,
      blocked,
      actionBlocked,
      summary,
      studySummary: {
        kind: 'question' as const,
        score: summary,
        marking:
          jevCount === 0
            ? ('Self-marked' as const)
            : jevCount === attempt.decisions.length
              ? ('Jev-marked' as const)
              : ('Mixed marking' as const),
      },
      markingAction: {
        complete: attempt.status === 'complete',
        label: continuing
          ? criterionIndex < criteria.length - 1
            ? 'Next'
            : 'Next unmarked'
          : attempt.status === 'answering'
            ? 'Next question'
            : 'Finish attempt',
        disabled:
          blocked ||
          !currentMarked ||
          (!continuing && attempt.status !== 'answering' && summary.status !== 'complete'),
        showFinish: continuing && attempt.status === 'marking',
        finishDisabled: blocked || summary.status !== 'complete',
      },
    };
  }
  setFormDirty = (formDirty: boolean) => this.update({ formDirty });
  setReflectionDirty = (reflectionDirty: boolean) => this.update({ reflectionDirty });
  value = (nodeId: string) =>
    this.drafts.get(nodeId) ??
    this.snapshot.record.responses.find((row) => row.nodeId === nodeId)!.draft;
  edit = (nodeId: string, value: QuestionSetResponseValue) => {
    this.drafts.set(nodeId, value);
    this.update({ draftVersion: this.snapshot.draftVersion + 1 });
  };
  flushDrafts = (): Promise<void> => {
    if (this.flushing) return this.flushing;
    this.update({ saving: true });
    const work = (async () => {
      do {
        while (this.drafts.size) {
          const [nodeId, value] = this.drafts.entries().next().value!;
          await this.run((record) =>
            saveQuestionSetResponseDraft(
              record.id,
              record.revisionId,
              nodeId,
              value,
              record.activeNodeId,
            ),
          );
          if (this.drafts.get(nodeId) === value) this.drafts.delete(nodeId);
        }
        await this.flush();
      } while (this.drafts.size);
    })().finally(() => {
      this.flushing = null;
      this.update({ saving: false });
    });
    this.flushing = work;
    return work;
  };
  private async command(command: Command) {
    await this.flushDrafts();
    return this.run(command);
  }
  perform = async (work: () => Promise<unknown>) => {
    this.update({ actionError: '', acting: true });
    try {
      await work();
    } catch (cause) {
      this.update({
        actionError: cause instanceof Error ? cause.message : 'Could not save this change.',
      });
    } finally {
      this.update({ acting: false });
    }
  };
  move = async (nodeId: string, allocationId: string | null = null) => {
    if (this.unfinished) {
      this.update({ actionError: 'Save or cancel your note or correction first.' });
      return;
    }
    await this.perform(() =>
      this.command((current) =>
        saveQuestionSetAttemptPosition(current.id, current.revisionId, nodeId, allocationId),
      ),
    );
  };
  nextPart = async () => {
    const next = this.practice.nextPart;
    if (this.practice.advancePart && next) await this.move(next.id);
  };
  private updateMarking = (
    change: (current: QuestionSetAttemptRecord) => Partial<SaveQuestionSetMarkingInput>,
  ) =>
    this.perform(() =>
      this.command((current) =>
        saveQuestionSetMarking(current.id, current.revisionId, {
          decisions: current.decisions,
          annotations: current.annotations,
          corrections: current.corrections,
          reflection: current.reflection,
          activeNodeId: current.activeNodeId,
          activeAllocationId: current.activeAllocationId,
          ...change(current),
        }),
      ),
    );
  setDecision = (
    allocationId: string,
    decision: SaveQuestionSetMarkingInput['decisions'][number] | null,
  ) =>
    this.updateMarking((current) => ({
      decisions: [
        ...current.decisions.filter((row) => row.allocationId !== allocationId),
        ...(decision ? [decision] : []),
      ],
    }));
  addAnnotation = (annotation: SaveQuestionSetMarkingInput['annotations'][number]) =>
    this.updateMarking((current) => ({ annotations: [...current.annotations, annotation] }));
  removeAnnotation = (id: string) =>
    this.updateMarking((current) => ({
      annotations: current.annotations.filter((row) => row.id !== id),
    }));
  setCorrection = (nodeId: string, content: string) =>
    this.updateMarking((current) => ({
      corrections: [
        ...current.corrections.filter((row) => row.nodeId !== nodeId),
        { nodeId, content, updatedAt: Date.now() },
      ],
    }));
  setReflection = (reflection: SaveQuestionSetMarkingInput['reflection']) =>
    this.updateMarking(() => ({ reflection }));
  /** Submission inspects acknowledged drafts, never the render that started the save. */
  async submit(confirmed = false) {
    await this.flushDrafts();
    const current = this.snapshot.record;
    const { nodes, questionId } = this.practice;
    const group =
      current.mode === 'paper'
        ? nodes
        : nodes.filter((node) => (node.parentIds[0] ?? node.id) === questionId);
    const hasBlank = group.some((node) => {
      const response = current.responses.find((row) => row.nodeId === node.id)!.draft;
      return response.kind === 'multiple-choice'
        ? !response.selectedOptionIds.length
        : !response.text.trim();
    });
    if (hasBlank && !confirmed) return false;
    await this.run((row) =>
      row.mode === 'paper'
        ? submitQuestionSetPaper(row.id, row.revisionId)
        : submitPracticeQuestion(row.id, row.revisionId, questionId),
    );
    return true;
  }
  revealKnowledge = (nodeId: string) =>
    this.command((current) =>
      recordQuestionSetAssistance(current.id, current.revisionId, {
        nodeId,
        kind: 'related-knowledge',
        occurredAt: Date.now(),
      }),
    );
  advanceMarking = async () => {
    const { markingAction, nextCriterion, nodes } = this.practice;
    if (markingAction.disabled) return;
    if (nextCriterion && this.practice.criteria.length > 1) {
      await this.move(nextCriterion.nodeId, nextCriterion.allocation.id);
    } else if (this.snapshot.record.status === 'answering') {
      const next = nodes.find(
        (node) => !feedbackAvailable(this.snapshot.record, node.parentIds[0] ?? node.id),
      );
      if (next) await this.move(next.id);
    } else await this.complete();
  };
  complete = async () => {
    if (this.practice.markingAction.finishDisabled) return;
    await this.perform(() =>
      this.command(async (current) => {
        const result = await completeQuestionSetAttempt(current.id, current.revisionId);
        recordUsageAction('study-completed');
        return result;
      }),
    );
  };
  exit = async () => {
    if (!this.snapshot.error) {
      const saved = await this.flushDrafts().then(
        () => true,
        () => false,
      );
      if (saved && this.snapshot.record.status !== 'complete') recordUsageAction('study-exited');
    }
  };
  /** Take a newer stored revision written elsewhere, unless this session is mid-write or stopped. */
  adopt(record: QuestionSetAttemptRecord) {
    const current = this.snapshot.record;
    if (
      record.id !== current.id ||
      record.revisionId === current.revisionId ||
      record.updatedAt < current.updatedAt ||
      this.snapshot.pending > 0 ||
      this.snapshot.error
    ) {
      return;
    }
    this.update({ record });
  }
  private async execute(command: Command): Promise<QuestionSetAttemptRecord> {
    try {
      return await command(this.snapshot.record);
    } catch (cause) {
      if (!(cause instanceof QuestionSetAttemptRevisionConflictError) || !this.load) throw cause;
      const latest = await this.load(this.snapshot.record.id);
      if (!latest) throw cause;
      this.update({ record: latest });
      return command(latest);
    }
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private update(patch: Partial<typeof this.snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  run(command: Command): Promise<QuestionSetAttemptRecord> {
    if (this.snapshot.error) return Promise.reject(this.snapshot.error);
    this.update({ pending: this.snapshot.pending + 1 });
    const work = this.tail
      .then(async () => {
        if (this.snapshot.error) {
          this.failed.push(command);
          throw this.snapshot.error;
        }
        try {
          const record = await this.execute(command);
          this.update({ record });
          return record;
        } catch (cause) {
          this.failed.push(command);
          this.update({
            error: cause instanceof Error ? cause : new Error('Could not save the attempt.'),
          });
          throw cause;
        }
      })
      .finally(() => this.update({ pending: this.snapshot.pending - 1 }));
    this.tail = work.catch(() => undefined);
    return work;
  }
  async flush() {
    await this.tail;
    if (this.snapshot.error) throw this.snapshot.error;
  }
  retry = async () => {
    await this.tail;
    const commands = this.failed.splice(0);
    if (commands.length) {
      this.update({ error: null });
      await Promise.all(commands.map((command) => this.run(command)));
    }
    await this.flushDrafts();
  };
}
