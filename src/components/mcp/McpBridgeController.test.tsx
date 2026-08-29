import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpBridgeController } from './McpBridgeController';
import type { McpBridgeOptions } from '../../mcp/bridge/renderer';
import type { McpConsentRequest, McpGrantNotice } from '../../mcp/bridge/protocol';
import type { RecordedUndo } from '../../mcp/bridge/undoRegistry';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  attach: vi.fn(),
  restoreCards: vi.fn(),
  restoreConcept: vi.fn(),
  restoreQuestion: vi.fn(),
  restoreAgentMemory: vi.fn(),
  restoreSequence: vi.fn(),
  resolveScopes: vi.fn(),
}));

vi.mock('../ui/Toast', () => ({ useToast: () => ({ notify: mocks.notify }) }));
vi.mock('../../mcp/bridge/renderer', () => ({ attachMcpBridge: mocks.attach }));
vi.mock('../../mcp/bridge/scopeResolver', () => ({ resolveToolScopes: mocks.resolveScopes }));
vi.mock('../../db/schema', () => ({
  db: { courses: { get: vi.fn().mockResolvedValue({ name: 'Biology' }) } },
}));
vi.mock('../../db/repository', () => ({
  restoreCards: mocks.restoreCards,
  restoreCourse: vi.fn(),
  restoreLesson: vi.fn(),
  restoreSequence: mocks.restoreSequence,
}));
vi.mock('../../questions/repository', () => ({
  restoreConcept: mocks.restoreConcept,
  restoreQuestion: mocks.restoreQuestion,
}));
vi.mock('../../db/agentMemoryRepository', () => ({
  agentMemoryRepository: { restore: mocks.restoreAgentMemory },
}));

describe('McpBridgeController', () => {
  let consentListener!: (request: McpConsentRequest) => void;
  let noticeListener!: (notice: McpGrantNotice) => void;
  let scopeListener!: (request: { id: string; tool: string; input: unknown }) => void;
  const replyConsent = vi.fn();
  const replyScopeResolution = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.attach.mockReturnValue(vi.fn());
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        isElectron: true,
        mcp: {
          onConsentRequest: vi.fn((callback: (request: McpConsentRequest) => void) => {
            consentListener = callback;
            return vi.fn();
          }),
          onGrantNotice: vi.fn((callback: (notice: McpGrantNotice) => void) => {
            noticeListener = callback;
            return vi.fn();
          }),
          onScopeResolutionRequest: vi.fn((callback: typeof scopeListener) => {
            scopeListener = callback;
            return vi.fn();
          }),
          replyScopeResolution,
          replyConsent,
        },
      },
    });
  });

  it('blocks on the consent UI and sends the human decision', async () => {
    render(<McpBridgeController />);
    act(() =>
      consentListener({
        id: 'consent-1',
        tool: 'lacuna.update_card',
        courseId: 'course-1',
        scope: 'write',
      }),
    );
    expect(await screen.findByText(/Allow write access to Biology/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Allow'));
    expect(replyConsent).toHaveBeenCalledWith({ id: 'consent-1', approved: true });
  });

  it('shows an implicit-read notice and offers repository-backed undo', async () => {
    let undoAvailable: ((undo: RecordedUndo) => void) | undefined;
    mocks.attach.mockImplementation((options: McpBridgeOptions) => {
      undoAvailable = options.onUndoAvailable;
      return vi.fn();
    });
    render(<McpBridgeController />);
    act(() => noticeListener({ courseId: 'course-1', tool: 'lacuna.get_card' }));
    await waitFor(() =>
      expect(mocks.notify).toHaveBeenCalledWith('MCP read access granted for Biology.', 'neutral'),
    );

    act(() =>
      undoAvailable?.({
        requestId: '1',
        toolName: 'lacuna.delete_card',
        recordedAt: 1,
        payload: { kind: 'restoreCards', snapshot: ['card'] },
      }),
    );
    const calls = mocks.notify.mock.calls;
    const options = calls[calls.length - 1]?.[2];
    expect(options.actionLabel).toBe('Undo');
    options.onAction();
    await waitFor(() => expect(mocks.restoreCards).toHaveBeenCalledWith(['card']));
  });

  it('passes the tool name into renderer-side scope resolution', async () => {
    mocks.resolveScopes.mockResolvedValue({
      ok: true,
      targets: [{ courseId: '__global__', label: 'All Lacuna data' }],
    });
    render(<McpBridgeController />);

    act(() =>
      scopeListener({
        id: 'scope-1',
        tool: 'lacuna.search_memories',
        input: { scope: { kind: 'global' } },
      }),
    );

    await waitFor(() =>
      expect(mocks.resolveScopes).toHaveBeenCalledWith(
        { scope: { kind: 'global' } },
        'lacuna.search_memories',
      ),
    );
    expect(replyScopeResolution).toHaveBeenCalledWith({
      id: 'scope-1',
      ok: true,
      targets: [{ courseId: '__global__', label: 'All Lacuna data' }],
    });
  });

  it('restores a deleted Concept through the Undo toast', async () => {
    let undoAvailable: ((undo: RecordedUndo) => void) | undefined;
    const snapshot = { id: 'concept-1' };
    mocks.attach.mockImplementation((options: McpBridgeOptions) => {
      undoAvailable = options.onUndoAvailable;
      return vi.fn();
    });
    render(<McpBridgeController />);

    act(() =>
      undoAvailable?.({
        requestId: 'concept-delete',
        toolName: 'lacuna.delete_concept',
        recordedAt: 1,
        payload: { kind: 'restoreConcept', snapshot },
      }),
    );
    const options = mocks.notify.mock.calls.at(-1)?.[2];
    options.onAction();

    await waitFor(() => expect(mocks.restoreConcept).toHaveBeenCalledWith(snapshot));
    expect(mocks.restoreSequence).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith('MCP action undone.', 'positive');
  });

  it('restores a deleted Question through the Undo toast', async () => {
    let undoAvailable: ((undo: RecordedUndo) => void) | undefined;
    const snapshot = { question: { id: 'question-1' }, concepts: { questionId: 'question-1' } };
    mocks.attach.mockImplementation((options: McpBridgeOptions) => {
      undoAvailable = options.onUndoAvailable;
      return vi.fn();
    });
    render(<McpBridgeController />);

    act(() =>
      undoAvailable?.({
        requestId: 'question-delete',
        toolName: 'lacuna.delete_question',
        recordedAt: 1,
        payload: { kind: 'restoreQuestion', snapshot },
      }),
    );
    const options = mocks.notify.mock.calls.at(-1)?.[2];
    options.onAction();

    await waitFor(() => expect(mocks.restoreQuestion).toHaveBeenCalledWith(snapshot));
    expect(mocks.restoreSequence).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith('MCP action undone.', 'positive');
  });

  it('restores a deleted learner memory through the Undo toast', async () => {
    let undoAvailable: ((undo: RecordedUndo) => void) | undefined;
    const snapshot = {
      memory: { id: 'memory-1', content: 'Historical evidence' },
      deletedAt: 2,
    };
    mocks.attach.mockImplementation((options: McpBridgeOptions) => {
      undoAvailable = options.onUndoAvailable;
      return vi.fn();
    });
    render(<McpBridgeController />);

    act(() =>
      undoAvailable?.({
        requestId: 'memory-delete',
        toolName: 'lacuna.delete_memory',
        recordedAt: 3,
        payload: { kind: 'restoreAgentMemory', snapshot },
      }),
    );
    const options = mocks.notify.mock.calls.at(-1)?.[2];
    options.onAction();

    await waitFor(() => expect(mocks.restoreAgentMemory).toHaveBeenCalledWith(snapshot));
    expect(mocks.notify).toHaveBeenCalledWith('MCP action undone.', 'positive');
  });
});
