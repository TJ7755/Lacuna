import type { QuestionSetAttemptRecord } from '../../questions/questionSetAttempts';

type Command = (record: QuestionSetAttemptRecord) => Promise<QuestionSetAttemptRecord>;

/** One revision owner per open attempt. Failed writes stop the queue instead of guessing a revision. */
export class QuestionSetAttemptSession {
  snapshot: { record: QuestionSetAttemptRecord; pending: number; error: Error | null };
  private tail: Promise<unknown> = Promise.resolve();
  private failed: Command[] = [];
  private listeners = new Set<() => void>();

  constructor(record: QuestionSetAttemptRecord) {
    this.snapshot = { record, pending: 0, error: null };
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
          const record = await command(this.snapshot.record);
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
