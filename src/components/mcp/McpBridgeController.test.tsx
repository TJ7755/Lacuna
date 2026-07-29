import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpBridgeController } from './McpBridgeController';
import type { McpBridgeOptions } from '../../mcp/bridge/renderer';
import type { McpConsentRequest, McpGrantNotice } from '../../mcp/bridge/protocol';
import type { RecordedUndo } from '../../mcp/bridge/undoRegistry';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(), attach: vi.fn(), restoreCards: vi.fn(), resolveScopes: vi.fn(),
}));

vi.mock('../ui/Toast', () => ({ useToast: () => ({ notify: mocks.notify }) }));
vi.mock('../../mcp/bridge/renderer', () => ({ attachMcpBridge: mocks.attach }));
vi.mock('../../mcp/bridge/scopeResolver', () => ({ resolveToolScopes: mocks.resolveScopes }));
vi.mock('../../db/schema', () => ({ db: { courses: { get: vi.fn().mockResolvedValue({ name: 'Biology' }) } } }));
vi.mock('../../db/repository', () => ({
  restoreCards: mocks.restoreCards, restoreCourse: vi.fn(), restoreLesson: vi.fn(), restoreSequence: vi.fn(),
}));

describe('McpBridgeController', () => {
  let consentListener!: (request: McpConsentRequest) => void;
  let noticeListener!: (notice: McpGrantNotice) => void;
  const replyConsent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.attach.mockReturnValue(vi.fn());
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { isElectron: true, mcp: {
      onConsentRequest: vi.fn((callback: (request: McpConsentRequest) => void) => { consentListener = callback; return vi.fn(); }),
      onGrantNotice: vi.fn((callback: (notice: McpGrantNotice) => void) => { noticeListener = callback; return vi.fn(); }),
      onScopeResolutionRequest: vi.fn(() => vi.fn()), replyConsent,
    } } });
  });

  it('blocks on the consent UI and sends the human decision', async () => {
    render(<McpBridgeController />);
    act(() => consentListener({ id: 'consent-1', tool: 'lacuna.update_card', courseId: 'course-1', scope: 'write' }));
    expect(await screen.findByText(/Allow write access to Biology/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Allow'));
    expect(replyConsent).toHaveBeenCalledWith({ id: 'consent-1', approved: true });
  });

  it('shows an implicit-read notice and offers repository-backed undo', async () => {
    let undoAvailable: ((undo: RecordedUndo) => void) | undefined;
    mocks.attach.mockImplementation((options: McpBridgeOptions) => { undoAvailable = options.onUndoAvailable; return vi.fn(); });
    render(<McpBridgeController />);
    act(() => noticeListener({ courseId: 'course-1', tool: 'lacuna.get_card' }));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('MCP read access granted for Biology.', 'neutral'));

    act(() => undoAvailable?.({ requestId: '1', toolName: 'lacuna.delete_card', recordedAt: 1, payload: { kind: 'restoreCards', snapshot: ['card'] } }));
    const calls = mocks.notify.mock.calls;
    const options = calls[calls.length - 1]?.[2];
    expect(options.actionLabel).toBe('Undo');
    options.onAction();
    await waitFor(() => expect(mocks.restoreCards).toHaveBeenCalledWith(['card']));
  });
});
