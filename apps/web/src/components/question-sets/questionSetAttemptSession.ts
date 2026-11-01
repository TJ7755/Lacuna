import { QuestionSetAttemptRevisionConflictError } from '../../questions/questionSetAttemptRepository';
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
  snapshot: { record: QuestionSetAttemptRecord; pending: number; error: Error | null };
  private tail: Promise<unknown> = Promise.resolve();
  private failed: Command[] = [];
  private listeners = new Set<() => void>();

  constructor(
    record: QuestionSetAttemptRecord,
    private load?: Loader,
  ) {
    this.snapshot = { record, pending: 0, error: null };
  }
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
  async retry() {
    await this.tail;
    const commands = this.failed.splice(0);
    if (!commands.length) return;
    this.update({ error: null });
    await Promise.all(commands.map((command) => this.run(command)));
  }
}
