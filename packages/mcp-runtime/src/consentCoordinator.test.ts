import { describe, expect, it, vi } from 'vitest';
import { ConsentCoordinator } from './consentCoordinator';

describe('ConsentCoordinator', () => {
  it('shares an in-flight decision but prompts again after settlement', async () => {
    const coordinator = new ConsentCoordinator();
    let decide!: (approved: boolean) => void;
    const prompt = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          decide = resolve;
        }),
    );

    const first = coordinator.request('client-1', 'course-1', 'write', prompt);
    const second = coordinator.request('client-1', 'course-1', 'write', prompt);
    expect(prompt).toHaveBeenCalledOnce();

    decide(true);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    await expect(
      coordinator.request('client-1', 'course-1', 'write', () => Promise.resolve(false)),
    ).resolves.toBe(false);
  });

  it('keeps decisions for different courses and scopes independent', async () => {
    const coordinator = new ConsentCoordinator();
    await expect(
      Promise.all([
        coordinator.request('client-1', 'course-1', 'write', () => Promise.resolve(true)),
        coordinator.request('client-1', 'course-2', 'write', () => Promise.resolve(false)),
        coordinator.request('client-1', 'course-1', 'destructive', () => Promise.resolve(false)),
      ]),
    ).resolves.toEqual([true, false, false]);
  });

  it('never shares a consent decision between clients', async () => {
    const coordinator = new ConsentCoordinator();
    await expect(
      Promise.all([
        coordinator.request('codex', 'course-1', 'write', () => Promise.resolve(true)),
        coordinator.request('claude', 'course-1', 'write', () => Promise.resolve(false)),
      ]),
    ).resolves.toEqual([true, false]);
  });
});
