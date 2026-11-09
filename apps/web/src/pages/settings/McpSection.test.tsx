import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpSection } from './McpSection';

const notify = vi.fn();
const getStatus = vi.fn();
const getGrants = vi.fn();
const grant = vi.fn();
const revoke = vi.fn();
const writeText = vi.fn();

vi.mock('../../components/ui/Toast', () => ({ useToast: () => ({ notify }) }));
vi.mock('../../state/useCourseData', () => ({
  useCourses: () => [{ id: 'course-1', name: 'Biology' }],
}));

describe('McpSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStatus.mockResolvedValue({ running: true, toolCount: 33, toolSurfaceVersion: 1 });
    getGrants.mockResolvedValue([
      { courseId: 'course-1', scope: 'write', grantedAt: 1, label: 'Biology' },
    ]);
    grant.mockResolvedValue({ courseId: 'course-1', scope: 'destructive', grantedAt: 2 });
    revoke.mockResolvedValue(undefined);
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { isElectron: true, mcp: { getStatus, getGrants, grant, revoke } },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not invent a stopped server or zero counts while status is loading', async () => {
    let finish!: (value: {
      running: boolean;
      toolCount: number;
      toolSurfaceVersion: number;
    }) => void;
    getStatus.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<McpSection />);
    expect(screen.getByRole('status')).toHaveTextContent('Reading MCP status…');
    expect(screen.queryByText('Stopped')).not.toBeInTheDocument();
    expect(screen.queryByText('0 tools')).not.toBeInTheDocument();
    expect(screen.queryByText('Surface v0')).not.toBeInTheDocument();
    expect(screen.queryByText('No MCP clients connected.')).not.toBeInTheDocument();
    await act(async () => finish({ running: false, toolCount: 0, toolSurfaceVersion: 2 }));
    expect(screen.getByRole('status')).toHaveTextContent('Stopped');
    expect(screen.getByText('0 tools')).toBeInTheDocument();
  });

  it('keeps a read failure visible and retries instead of asserting there are no clients', async () => {
    getStatus.mockRejectedValueOnce(new Error('IPC unavailable'));
    render(<McpSection />);
    await screen.findByText('MCP status unavailable.');
    expect(screen.queryByText('Stopped')).not.toBeInTheDocument();
    expect(screen.queryByText('No MCP clients connected.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry MCP status' }));
    expect(await screen.findByText('Running')).toBeInTheDocument();
    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(notify).not.toHaveBeenCalled();
  });

  it('hides stale grants after a refresh fails and ignores an older successful read', async () => {
    let finish!: (value: {
      running: boolean;
      toolCount: number;
      toolSurfaceVersion: number;
    }) => void;
    getStatus.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<McpSection />);
    getStatus.mockRejectedValueOnce(new Error('IPC unavailable'));
    fireEvent.focus(window);
    await screen.findByText('MCP status unavailable.');
    await act(async () => finish({ running: true, toolCount: 33, toolSurfaceVersion: 1 }));
    expect(screen.getByRole('status')).toHaveTextContent('MCP status unavailable.');
    expect(screen.queryByText('Edit access')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry MCP status' }));
    await screen.findByText('Edit access');
    getStatus.mockRejectedValueOnce(new Error('IPC unavailable'));
    fireEvent.focus(window);
    await screen.findByText('MCP status unavailable.');
    expect(screen.queryByText('Running')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('explains cumulative permissions only when requested', async () => {
    render(<McpSection />);
    await screen.findByText('Running');
    const info = screen.getByRole('button', { name: 'Access permissions' });
    expect(info).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(info);
    expect(info).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Edit: read, create and edit content')).toBeInTheDocument();
    expect(
      screen.getByText('Delete: read, create, edit, delete or bulk-change content'),
    ).toBeInTheDocument();
    fireEvent.click(info);
    expect(screen.queryByText('Edit: read, create and edit content')).not.toBeInTheDocument();
  });

  it('confirms the selected client, course and capability before granting connection access', async () => {
    const grantConnection = vi.fn().mockResolvedValue(undefined);
    const connection = { connectionId: 'client-42-long', name: 'Study assistant', grants: [] };
    Object.assign(window.electronAPI!.mcp!, {
      getConnections: vi.fn().mockResolvedValue([connection]),
      grantConnection,
    });
    render(<McpSection />);
    await screen.findByText('Study assistant');
    const biologyRow = screen.getByText('Biology').closest('div.flex.flex-wrap')!;
    fireEvent.click(withinRow(biologyRow, 'Edit'));
    expect(
      screen.getByText(
        'Allow Study assistant (client-4) to read, create and edit content — Biology?',
      ),
    ).toBeInTheDocument();
    expect(grantConnection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(withinRow(biologyRow, 'Edit')).toHaveFocus());
    expect(grantConnection).not.toHaveBeenCalled();
    fireEvent.click(withinRow(biologyRow, 'Edit'));
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await waitFor(() =>
      expect(grantConnection).toHaveBeenCalledExactlyOnceWith(
        'client-42-long',
        'course-1',
        'write',
        'Biology',
      ),
    );
    expect(grant).not.toHaveBeenCalled();
  });

  it('shows server status and current per-course grants', async () => {
    render(<McpSection />);
    expect(await screen.findByText('Running')).toBeInTheDocument();
    expect(screen.getByText('33 tools')).toBeInTheDocument();
    expect(screen.getByText('Biology')).toBeInTheDocument();
    expect(screen.getByText('Edit access')).toBeInTheDocument();
  });

  it('grants and revokes access through the narrow Electron API', async () => {
    render(<McpSection />);
    await screen.findByText('Edit access');
    const biologyRow = screen.getByText('Biology').closest('div.flex.flex-wrap')!;
    fireEvent.click(withinRow(biologyRow, 'Delete'));
    expect(grant).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        /Allow Embedded stdio client to read, create, edit, delete or bulk-change content — Biology/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await waitFor(() => expect(grant).toHaveBeenCalledWith('course-1', 'destructive', 'Biology'));
    fireEvent.click(withinRow(biologyRow, 'Revoke'));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('course-1'));
  });

  it('allows an existing grant to be stepped down', async () => {
    getGrants.mockResolvedValue([
      { courseId: 'course-1', scope: 'destructive', grantedAt: 1, label: 'Biology' },
    ]);
    render(<McpSection />);
    await screen.findByText('Delete access');
    const biologyRow = screen.getByText('Biology').closest('div.flex.flex-wrap')!;
    fireEvent.click(withinRow(biologyRow, 'Limit to edit'));
    await waitFor(() => expect(grant).toHaveBeenCalledWith('course-1', 'write', 'Biology'));
  });

  it('does not report a successful permission update as failed when its status refresh rejects', async () => {
    render(<McpSection />);
    await screen.findByText('Edit access');
    getStatus.mockRejectedValueOnce(new Error('IPC unavailable'));
    const biologyRow = screen.getByText('Biology').closest('div.flex.flex-wrap')!;
    fireEvent.click(withinRow(biologyRow, 'Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await screen.findByText('MCP status unavailable.');
    expect(grant).toHaveBeenCalledExactlyOnceWith('course-1', 'destructive', 'Biology');
    expect(notify).not.toHaveBeenCalled();
  });

  it('copies a portable companion configuration', async () => {
    getStatus.mockResolvedValue({
      running: true,
      toolCount: 46,
      toolSurfaceVersion: 2,
      companion: {
        command: '/Applications/Lacuna.app/Contents/MacOS/Lacuna',
        args: ['--mcp-companion'],
      },
    });
    render(<McpSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        JSON.stringify(
          {
            mcpServers: {
              lacuna: {
                command: '/Applications/Lacuna.app/Contents/MacOS/Lacuna',
                args: ['--mcp-companion'],
              },
            },
          },
          null,
          2,
        ),
      ),
    );
  });

  it('polls status at a low cadence instead of every two seconds', async () => {
    vi.useFakeTimers();
    render(<McpSection />);
    await act(async () => {
      await Promise.resolve();
    });
    getStatus.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(9_999);
      await Promise.resolve();
    });
    expect(getStatus).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(getStatus).toHaveBeenCalledOnce();
  });

  it('keeps the configuration selectable when automatic copying fails', async () => {
    getStatus.mockResolvedValue({
      running: true,
      toolCount: 46,
      toolSurfaceVersion: 2,
      companion: { command: 'lacuna', args: ['--mcp-companion'] },
    });
    writeText.mockRejectedValueOnce(new Error('Clipboard denied'));
    render(<McpSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        'Copy failed — select the configuration and copy it manually.',
        'negative',
      ),
    );
    expect(screen.getByLabelText('MCP client configuration')).toHaveClass('select-text');
    expect(screen.getByLabelText('MCP client configuration')).toHaveTextContent('--mcp-companion');
  });
});

function withinRow(row: Element, label: string): HTMLElement {
  const button = [...row.querySelectorAll('button')].find((item) => item.textContent === label);
  if (!button) throw new Error(`Missing ${label} button.`);
  return button;
}
