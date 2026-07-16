import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpSection } from './McpSection';

const notify = vi.fn();
const getStatus = vi.fn();
const getGrants = vi.fn();
const grant = vi.fn();
const revoke = vi.fn();

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
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { isElectron: true, mcp: { getStatus, getGrants, grant, revoke } },
    });
  });

  it('shows server status and current per-course grants', async () => {
    render(<McpSection motionMultiplier={0} />);
    expect(await screen.findByText('Running')).toBeInTheDocument();
    expect(screen.getByText('33 tools')).toBeInTheDocument();
    expect(screen.getByText('Biology')).toBeInTheDocument();
    expect(screen.getByText('write access')).toBeInTheDocument();
  });

  it('grants and revokes access through the narrow Electron API', async () => {
    render(<McpSection motionMultiplier={0} />);
    await screen.findByText('write access');
    const biologyRow = screen.getByText('Biology').closest('div.flex.flex-wrap')!;
    fireEvent.click(withinRow(biologyRow, 'Destructive'));
    await waitFor(() => expect(grant).toHaveBeenCalledWith('course-1', 'destructive', 'Biology'));
    fireEvent.click(withinRow(biologyRow, 'Revoke'));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('course-1'));
  });
});

function withinRow(row: Element, label: string): HTMLElement {
  const button = [...row.querySelectorAll('button')].find((item) => item.textContent === label);
  if (!button) throw new Error(`Missing ${label} button.`);
  return button;
}
