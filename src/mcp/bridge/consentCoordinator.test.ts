import { describe, expect, it, vi } from 'vitest';
import { ConsentCoordinator } from './consentCoordinator';

describe('ConsentCoordinator', () => {
  it('shares one in-flight decision for the same course and scope', async () => {
    const coordinator = new ConsentCoordinator();
    let decide!: (approved: boolean) => void;
    const prompt = vi.fn(() => new Promise<boolean>((resolve) => { decide = resolve; }));

    const first = coordinator.request('course-1', 'write', prompt);
    const second = coordinator.request('course-1', 'write', prompt);
    expect(prompt).toHaveBeenCalledOnce();

    decide(true);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  it('keeps different courses and scopes independent and prompts again after settlement', async () => {
    const coordinator = new ConsentCoordinator();
    const prompt = vi.fn().mockResolvedValue(true);

    await Promise.all([
      coordinator.request('course-1', 'write', prompt),
      coordinator.request('course-2', 'write', prompt),
      coordinator.request('course-1', 'destructive', prompt),
    ]);
    expect(prompt).toHaveBeenCalledTimes(3);

    await coordinator.request('course-1', 'write', prompt);
    expect(prompt).toHaveBeenCalledTimes(4);
  });
});
