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
    getGrants.mockResolvedValue([{ courseId: 'course-1', scope: 'write', grantedAt: 1, label: 'Biology' }]);
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

  it('shows server status and current per-course grants', async () => {
    render(<McpSection />);
    expect(await screen.findByText('Running')).toBeInTheDocument();
    expect(screen.getByText('33 tools')).toBeInTheDocument();
    expect(screen.getByText('Biology')).toBeInTheDocument();
    expect(screen.getByText('write access')).toBeInTheDocument();
  });

  it('grants and revokes access through the narrow Electron API', async () => {
    render(<McpSection />);
    await screen.findByText('write access');
    const biologyRow = screen.getByText('Biology').closest('div.flex.flex-wrap')!;
    fireEvent.click(withinRow(biologyRow, 'Destructive'));
    await waitFor(() => expect(grant).toHaveBeenCalledWith('course-1', 'destructive', 'Biology'));
    fireEvent.click(withinRow(biologyRow, 'Revoke'));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('course-1'));
  });

  it('allows an existing grant to be stepped down', async () => {
    getGrants.mockResolvedValue([
      { courseId: 'course-1', scope: 'destructive', grantedAt: 1, label: 'Biology' },
    ]);
    render(<McpSection />);
    await screen.findByText('destructive access');
    const biologyRow = screen.getByText('Biology').closest('div.flex.flex-wrap')!;
    fireEvent.click(withinRow(biologyRow, 'Downgrade to write'));
    await waitFor(() => expect(grant).toHaveBeenCalledWith('course-1', 'write', 'Biology'));
  });

  it('copies a portable companion configuration', async () => {
    getStatus.mockResolvedValue({
      running: true,
      toolCount: 46,
      toolSurfaceVersion: 2,
      companion: { command: '/Applications/Lacuna.app/Contents/MacOS/Lacuna', args: ['--mcp-companion'] },
    });
    render(<McpSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(JSON.stringify({ mcpServers: { lacuna: {
      command: '/Applications/Lacuna.app/Contents/MacOS/Lacuna',
      args: ['--mcp-companion'],
    } } }, null, 2)));
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
});

function withinRow(row: Element, label: string): HTMLElement {
  const button = [...row.querySelectorAll('button')].find((item) => item.textContent === label);
  if (!button) throw new Error(`Missing ${label} button.`);
  return button;
}
