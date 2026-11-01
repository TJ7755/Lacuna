import { vi } from 'vitest';
import type * as Fflate from 'fflate';

vi.mock('fflate', async (importOriginal) => {
  const actual = await importOriginal<typeof Fflate>();
  return {
    ...actual,
    unzipSync: vi.fn((...args: Parameters<typeof actual.unzipSync>) => actual.unzipSync(...args)),
  };
});
