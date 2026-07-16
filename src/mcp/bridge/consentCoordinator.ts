/** Coalesces identical in-flight consent prompts without caching the decision afterwards. */
export class ConsentCoordinator {
  private readonly pending = new Map<string, Promise<boolean>>();

  request(courseId: string, scope: 'write' | 'destructive', prompt: () => Promise<boolean>): Promise<boolean> {
    const key = `${courseId}\0${scope}`;
    const existing = this.pending.get(key);
    if (existing) return existing;

    const decision = prompt().finally(() => {
      if (this.pending.get(key) === decision) this.pending.delete(key);
    });
    this.pending.set(key, decision);
    return decision;
  }

  clear(): void {
    this.pending.clear();
  }
}
