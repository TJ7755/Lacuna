import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentMemoryRepository } from '../../db/agentMemoryRepository';
import type { AgentMemory } from '../../db/types';
import { ToastProvider } from '../../components/ui/Toast';
import { AiMemoryInspector } from './AiMemoryInspector';

const memory = vi.hoisted(
  () =>
    ({
      id: 'memory-1',
      courseId: 'course-1',
      tags: ['misconception'],
      status: 'uncertain',
      content: 'Division distributes over addition.',
      references: [{ kind: 'lesson', id: 'missing-lesson', label: 'Fractions' }],
      basis: 'agent-inferred',
      createdAt: 1,
      updatedAt: 2,
    }) as AgentMemory,
);
const liveQuery = vi.hoisted(() => ({ querier: null as null | (() => Promise<unknown>) }));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (querier: () => Promise<unknown>) => {
    liveQuery.querier = querier;
    return {
      memories: [memory],
      unavailable: new Set(['memory-1:lesson:missing-lesson']),
      courseNames: new Map([['course-1', 'Maths']]),
    };
  },
}));

function repository() {
  return {
    search: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(memory),
    delete: vi.fn().mockResolvedValue({ memory, deletedAt: 3 }),
    restore: vi.fn().mockResolvedValue(memory),
  } as unknown as AgentMemoryRepository;
}

describe('AiMemoryInspector', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows unavailable historical references and saves learner corrections', async () => {
    const repo = repository();
    render(
      <ToastProvider>
        <AiMemoryInspector repository={repo} />
      </ToastProvider>,
    );

    expect(screen.getByText('Fractions · Unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Correct' }));
    fireEvent.change(screen.getByLabelText('Correct memory'), {
      target: { value: 'Learner correction.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));

    await waitFor(() =>
      expect(repo.update).toHaveBeenCalledWith('memory-1', {
        content: 'Learner correction.',
      }),
    );
  });

  it('changes status and requires confirmation before deletion', async () => {
    const repo = repository();
    render(
      <ToastProvider>
        <AiMemoryInspector repository={repo} />
      </ToastProvider>,
    );

    fireEvent.change(screen.getByLabelText(`Status for ${memory.content}`), {
      target: { value: 'resolved' },
    });
    await waitFor(() =>
      expect(repo.update).toHaveBeenCalledWith('memory-1', { status: 'resolved' }),
    );

    fireEvent.click(screen.getByRole('button', { name: `Delete memory: ${memory.content}` }));
    expect(repo.delete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(repo.delete).toHaveBeenCalledWith('memory-1'));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(repo.restore).toHaveBeenCalled());
  });

  it('excludes expired memories unless the learner asks to include them', async () => {
    const repo = repository();
    render(
      <ToastProvider>
        <AiMemoryInspector repository={repo} />
      </ToastProvider>,
    );

    await liveQuery.querier?.();
    expect(repo.search).toHaveBeenLastCalledWith({
      scope: { kind: 'all' },
      query: '',
      includeExpired: false,
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Include expired' }));
    await liveQuery.querier?.();
    expect(repo.search).toHaveBeenLastCalledWith({
      scope: { kind: 'all' },
      query: '',
      includeExpired: true,
    });
  });

  it('keeps the memory heading and filters in one responsive section header', () => {
    const repo = repository();
    render(
      <ToastProvider>
        <AiMemoryInspector repository={repo} />
      </ToastProvider>,
    );

    const heading = screen.getByRole('heading', { name: 'Teaching memory' });
    const header = heading.parentElement?.parentElement;
    expect(header).toHaveClass('grid', 'sm:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]');
    expect(screen.getByPlaceholderText('Search memory').parentElement?.parentElement).toHaveClass(
      'flex',
      'sm:flex-row',
    );
  });
});
