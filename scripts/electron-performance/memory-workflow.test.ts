import { describe, expect, it, vi } from 'vitest';
import { executeMemoryCheckpointPlan, MEMORY_CHECKPOINT_ORDER } from './memory-workflow';

describe('packaged memory checkpoint plan', () => {
  it('records the exact workload order and keeps the final 15-second quiet settle', async () => {
    const checkpoints: string[] = [];
    const actions: string[] = [];
    const action = (name: string) =>
      vi.fn(async (argument?: string) => {
        actions.push(argument ? `${name}:${argument}` : name);
      });
    const record = vi.fn(async (checkpoint: string, quietMs?: number) => {
      checkpoints.push(checkpoint);
      if (checkpoint === 'returned-idle') expect(quietMs).toBe(15_000);
    });

    await executeMemoryCheckpointPlan({
      record,
      openCourse: action('course'),
      dashboard: action('dashboard'),
      openStudySheet: action('study-sheet'),
      closeStudy: action('close-study'),
      enableAi: action('enable-ai'),
      openAi: action('open-ai'),
      closeAi: action('close-ai'),
      importLargeFixture: action('import'),
    });

    expect(checkpoints).toEqual(MEMORY_CHECKPOINT_ORDER);
    expect(actions).toEqual([
      'course:Welcome to Lacuna',
      'dashboard',
      'course:Welcome to Lacuna',
      'study-sheet',
      'close-study',
      'dashboard',
      'enable-ai',
      'open-ai',
      'close-ai',
      'import',
      'course:Memory benchmark course',
      'study-sheet',
      'close-study',
      'dashboard',
    ]);
  });
});
