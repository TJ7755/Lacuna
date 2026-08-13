import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { GridIcon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/Toast';
import { GLOBAL_SCOPE_KEY } from '../../mcp/grants';
import type { McpGrant } from '../../mcp/types';
import type { McpClientConnection } from '../../mcp/connections';
import { useCourses } from '../../state/useCourseData';

interface McpStatus {
  running: boolean;
  toolCount: number;
  toolSurfaceVersion: number;
  clients?: McpClientConnection[];
  companion?: { command: string; args: string[] };
}
const SCOPES = ['read', 'write', 'destructive'] as const;
const MCP_STATUS_POLL_MS = 10_000;
const LOWER_SCOPE: Partial<Record<McpGrant['scope'], McpGrant['scope']>> = {
  write: 'read',
  destructive: 'write',
};

export function McpSection() {
  const mcp = window.electronAPI?.mcp;
  const courses = useCourses();
  const { notify } = useToast();
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [grants, setGrants] = useState<McpGrant[]>([]);
  const [connections, setConnections] = useState<McpClientConnection[]>([]);
  const refresh = useCallback(async () => {
    if (!mcp) return;
    const [nextStatus, nextGrants, nextConnections] = await Promise.all([
      mcp.getStatus(),
      mcp.getGrants(),
      mcp.getConnections?.() ?? Promise.resolve([]),
    ]);
    setStatus(nextStatus);
    setGrants(nextGrants);
    setConnections(nextConnections.length > 0 ? nextConnections : nextStatus.clients ?? []);
  }, [mcp]);

  const refreshWithNotice = useCallback(async () => {
    try {
      await refresh();
    } catch {
      notify('Could not read MCP server status.', 'negative');
    }
  }, [notify, refresh]);

  useEffect(() => {
    void refreshWithNotice();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshWithNotice();
    };
    const timer = window.setInterval(refreshWhenVisible, MCP_STATUS_POLL_MS);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
    };
  }, [refreshWithNotice]);
  if (!mcp) return null;
  const rows = [
    { id: GLOBAL_SCOPE_KEY, name: 'All Lacuna data' },
    ...(courses ?? []).map((course) => ({ id: course.id, name: course.name })),
  ];

  const visibleConnections: McpClientConnection[] = connections.length > 0
    ? connections
    : grants.length > 0
      ? [{ connectionId: '__embedded__', name: 'Embedded stdio client', connectedAt: 0, lastActivityAt: 0, grants }]
      : [];

  async function setGrant(connectionId: string, courseId: string, scope: McpGrant['scope'], label: string) {
    try {
      if (connectionId === '__embedded__' || !mcp!.grantConnection) await mcp!.grant(courseId, scope, label);
      else await mcp!.grantConnection(connectionId, courseId, scope, label);
      await refresh();
    }
    catch { notify('Could not update MCP access.', 'negative'); }
  }
  async function revoke(connectionId: string, courseId: string) {
    try {
      if (connectionId === '__embedded__' || !mcp!.revokeConnection) await mcp!.revoke(courseId);
      else await mcp!.revokeConnection(connectionId, courseId);
      await refresh();
    }
    catch { notify('Could not revoke MCP access.', 'negative'); }
  }
  async function copyConfiguration() {
    if (!status?.companion) return;
    const configuration = JSON.stringify({ mcpServers: { lacuna: {
      command: status.companion.command,
      args: status.companion.args,
    } } }, null, 2);
    try {
      await navigator.clipboard.writeText(configuration);
      notify('MCP client configuration copied to the clipboard.', 'positive');
    } catch {
      notify('Copy failed — select the configuration and copy it manually.', 'negative');
    }
  }

  return (
    <section id="settings-mcp"
      className="mb-8 rounded-2xl border border-line bg-surface p-6">
      <div className="mb-1 flex items-center gap-2 text-accent"><GridIcon width={18} height={18} /><h2 className="font-display text-xl">MCP server</h2></div>
      <p className="mb-4 text-sm text-ink-soft">Control what connected MCP clients may read or change. Access is cleared when each client disconnects.</p>
      <div className="mb-5 flex flex-wrap gap-x-5 gap-y-1 rounded-xl border border-line bg-surface-raised/40 px-4 py-3 text-sm">
        <span className={status?.running ? 'text-positive' : 'text-negative'}>{status?.running ? 'Running' : 'Stopped'}</span>
        <span className="text-ink-soft">{status?.toolCount ?? 0} tools</span>
        <span className="text-ink-faint">Surface v{status?.toolSurfaceVersion ?? 0}</span>
      </div>
      {status?.companion && <div className="mb-5 rounded-xl border border-line bg-surface-raised/40 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">MCP client configuration</div>
          <Button variant="secondary" size="sm" onClick={() => void copyConfiguration()}>Copy</Button>
        </div>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs text-ink">{JSON.stringify({ mcpServers: { lacuna: { command: status.companion.command, args: status.companion.args } } }, null, 2)}</pre>
      </div>}
      <div className="space-y-4">
        {visibleConnections.length === 0 && <p className="rounded-xl border border-line px-4 py-3 text-sm text-ink-faint">No MCP clients connected.</p>}
        {visibleConnections.map((connection) => <div key={connection.connectionId} className="rounded-xl border border-line p-3">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-sm font-medium text-ink">{connection.name}{connection.version ? ` ${connection.version}` : ''}</div>
            <div className="font-mono text-[11px] text-ink-faint">{connection.connectionId.slice(0, 8)}</div>
          </div>
          <div className="space-y-2">
            {rows.map((row) => {
              const current = connection.grants.find((entry) => entry.courseId === row.id);
              const lowerScope = current ? LOWER_SCOPE[current.scope] : undefined;
              const higherScopes = current ? SCOPES.slice(SCOPES.indexOf(current.scope) + 1) : SCOPES;
              return <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                <div className="min-w-0"><div className="truncate text-sm text-ink">{row.name}</div><div className="text-xs text-ink-faint">{current ? `${current.scope} access` : 'No access'}</div></div>
                <div className="flex flex-wrap gap-1">
                  {higherScopes.map((scope) => <Button key={scope} variant="ghost" size="sm" onClick={() => void setGrant(connection.connectionId, row.id, scope, row.name)}>{scope[0].toUpperCase() + scope.slice(1)}</Button>)}
                  {lowerScope && <Button variant="ghost" size="sm" onClick={() => void setGrant(connection.connectionId, row.id, lowerScope, row.name)}>Downgrade to {lowerScope}</Button>}
                  {current && <Button variant="secondary" size="sm" onClick={() => void revoke(connection.connectionId, row.id)}>Revoke</Button>}
                </div>
              </div>;
            })}
          </div>
        </div>)}
      </div>
    </section>
  );
}
