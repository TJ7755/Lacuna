import { useCallback, useEffect, useState } from 'react';
import { m as motion } from 'motion/react';
import { Button } from '../../components/ui/Button';
import { GridIcon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/Toast';
import { GLOBAL_SCOPE_KEY } from '../../mcp/grants';
import type { McpGrant } from '../../mcp/types';
import { useCourses } from '../../state/useCourseData';

interface McpStatus { running: boolean; toolCount: number; toolSurfaceVersion: number }

export function McpSection({ motionMultiplier }: { motionMultiplier: number }) {
  const mcp = window.electronAPI?.mcp;
  const courses = useCourses();
  const { notify } = useToast();
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [grants, setGrants] = useState<McpGrant[]>([]);
  const refresh = useCallback(async () => {
    if (!mcp) return;
    const [nextStatus, nextGrants] = await Promise.all([mcp.getStatus(), mcp.getGrants()]);
    setStatus(nextStatus);
    setGrants(nextGrants);
  }, [mcp]);

  useEffect(() => { void refresh().catch(() => notify('Could not read MCP server status.', 'negative')); }, [notify, refresh]);
  if (!mcp) return null;
  const rows = [
    { id: GLOBAL_SCOPE_KEY, name: 'All Lacuna data' },
    ...(courses ?? []).map((course) => ({ id: course.id, name: course.name })),
  ];

  async function setGrant(courseId: string, scope: McpGrant['scope'], label: string) {
    try { await mcp!.grant(courseId, scope, label); await refresh(); }
    catch { notify('Could not update MCP access.', 'negative'); }
  }
  async function revoke(courseId: string) {
    try { await mcp!.revoke(courseId); await refresh(); }
    catch { notify('Could not revoke MCP access.', 'negative'); }
  }

  return (
    <motion.section id="settings-mcp" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 * motionMultiplier, delay: 0.4 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
      className="mb-8 rounded-2xl border border-line bg-surface p-6">
      <div className="mb-1 flex items-center gap-2 text-accent"><GridIcon width={18} height={18} /><h2 className="font-display text-xl">MCP server</h2></div>
      <p className="mb-4 text-sm text-ink-soft">Control what connected MCP clients may read or change during this Lacuna session. Access is cleared when Lacuna closes.</p>
      <div className="mb-5 flex flex-wrap gap-x-5 gap-y-1 rounded-xl border border-line bg-surface-raised/40 px-4 py-3 text-sm">
        <span className={status?.running ? 'text-positive' : 'text-negative'}>{status?.running ? 'Running' : 'Stopped'}</span>
        <span className="text-ink-soft">{status?.toolCount ?? 0} tools</span>
        <span className="text-ink-faint">Surface v{status?.toolSurfaceVersion ?? 0}</span>
      </div>
      <div className="space-y-2">
        {rows.map((row) => {
          const current = grants.find((entry) => entry.courseId === row.id);
          return <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
            <div className="min-w-0"><div className="truncate text-sm text-ink">{row.name}</div><div className="text-xs text-ink-faint">{current ? `${current.scope} access` : 'No access'}</div></div>
            <div className="flex flex-wrap gap-1">
              {(['read', 'write', 'destructive'] as const).map((scope) => <Button key={scope} variant="ghost" size="sm" onClick={() => void setGrant(row.id, scope, row.name)}>{scope[0].toUpperCase() + scope.slice(1)}</Button>)}
              {current && <Button variant="secondary" size="sm" onClick={() => void revoke(row.id)}>Revoke</Button>}
            </div>
          </div>;
        })}
      </div>
    </motion.section>
  );
}
