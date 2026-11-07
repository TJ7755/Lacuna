import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmInlineSwap } from '../../components/ui/ConfirmInline';
import {
  BookIcon,
  EditIcon,
  GridIcon,
  InfoIcon,
  RefreshIcon,
  TrashIcon,
} from '../../components/ui/icons';
import { useToast } from '../../components/ui/Toast';
import { GLOBAL_SCOPE_KEY } from '../../mcp/grants';
import type { McpGrant } from '../../mcp/types';
import type { McpClientConnection } from '../../mcp/connections';
import { useCourses } from '../../state/useCourseData';
import { SettingsSectionHeading, SettingsSubsectionHeading } from './SettingsSectionHeading';
import { SETTINGS_HEADING_ROW_CLASS, SettingsCard } from './SettingsUi';
import { cn } from '../../components/ui/cn';

interface McpStatus {
  running: boolean;
  toolCount: number;
  toolSurfaceVersion: number;
  clients?: McpClientConnection[];
  companion?: { command: string; args: string[]; env?: Record<string, string> };
}
const SCOPES = ['read', 'write', 'destructive'] as const;
const SCOPE_INFO = {
  read: { label: 'Read', description: 'read content', Icon: BookIcon },
  write: { label: 'Edit', description: 'read, create and edit content', Icon: EditIcon },
  destructive: {
    label: 'Delete',
    description: 'read, create, edit, delete or bulk-change content',
    Icon: TrashIcon,
  },
};
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
  const [readState, setReadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const requestId = useRef(0);
  const [scopeInfoOpen, setScopeInfoOpen] = useState(false);
  const [pendingGrant, setPendingGrant] = useState<{
    connectionId: string;
    courseId: string;
    scope: McpGrant['scope'];
  } | null>(null);
  const [grantBusy, setGrantBusy] = useState(false);
  const [grants, setGrants] = useState<McpGrant[]>([]);
  const [connections, setConnections] = useState<McpClientConnection[]>([]);
  const refresh = useCallback(async () => {
    if (!mcp) return;
    const attempt = ++requestId.current;
    try {
      const [nextStatus, nextGrants, nextConnections] = await Promise.all([
        mcp.getStatus(),
        mcp.getGrants(),
        mcp.getConnections?.() ?? Promise.resolve([]),
      ]);
      if (attempt !== requestId.current) return;
      setStatus(nextStatus);
      setGrants(nextGrants);
      setConnections(nextConnections.length > 0 ? nextConnections : (nextStatus.clients ?? []));
      setReadState('ready');
    } catch (error) {
      if (attempt === requestId.current) setReadState('error');
      throw error;
    }
  }, [mcp]);

  // The persistent status row owns read failures; polling must not repeat error toasts.
  const readStatus = useCallback(() => refresh().catch(() => undefined), [refresh]);
  const cancelReads = useCallback(() => {
    requestId.current++;
  }, []);

  useEffect(() => {
    void readStatus();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void readStatus();
    };
    const timer = window.setInterval(refreshWhenVisible, MCP_STATUS_POLL_MS);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);
    return () => {
      cancelReads();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
    };
  }, [readStatus, cancelReads]);
  if (!mcp) return null;
  const rows = [
    { id: GLOBAL_SCOPE_KEY, name: 'All Lacuna data' },
    ...(courses ?? []).map((course) => ({ id: course.id, name: course.name })),
  ];

  const visibleConnections: McpClientConnection[] =
    connections.length > 0
      ? connections
      : grants.length > 0
        ? [
            {
              connectionId: '__embedded__',
              name: 'Embedded stdio client',
              connectedAt: 0,
              lastActivityAt: 0,
              grants,
            },
          ]
        : [];

  async function setGrant(
    connectionId: string,
    courseId: string,
    scope: McpGrant['scope'],
    label: string,
  ) {
    setGrantBusy(true);
    try {
      if (connectionId === '__embedded__' || !mcp!.grantConnection)
        await mcp!.grant(courseId, scope, label);
      else await mcp!.grantConnection(connectionId, courseId, scope, label);
      await readStatus();
    } catch {
      notify('Could not update MCP access.', 'negative');
    } finally {
      setGrantBusy(false);
    }
  }
  async function revoke(connectionId: string, courseId: string) {
    try {
      if (connectionId === '__embedded__' || !mcp!.revokeConnection) await mcp!.revoke(courseId);
      else await mcp!.revokeConnection(connectionId, courseId);
      await readStatus();
    } catch {
      notify('Could not revoke MCP access.', 'negative');
    }
  }
  async function copyConfiguration() {
    if (!status?.companion) return;
    const configuration = JSON.stringify(
      {
        mcpServers: {
          lacuna: {
            command: status.companion.command,
            args: status.companion.args,
            ...(status.companion.env ? { env: status.companion.env } : {}),
          },
        },
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(configuration);
      notify('MCP client configuration copied to the clipboard.', 'positive');
    } catch {
      notify('Copy failed — select the configuration and copy it manually.', 'negative');
    }
  }

  return (
    <SettingsCard id="settings-mcp">
      <div className={cn('mb-1', SETTINGS_HEADING_ROW_CLASS)}>
        <GridIcon width={18} height={18} />
        <SettingsSectionHeading className="font-display text-xl font-semibold tracking-tight">
          MCP server
        </SettingsSectionHeading>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Access permissions"
          aria-expanded={scopeInfoOpen}
          aria-controls="mcp-scope-info"
          onClick={() => setScopeInfoOpen((open) => !open)}
        >
          <InfoIcon width={18} height={18} />
        </Button>
      </div>
      <p className="mb-4 text-sm text-ink-soft">Access is cleared when each client disconnects.</p>
      {scopeInfoOpen && (
        <div id="mcp-scope-info" className="mb-4 space-y-2 text-sm text-ink-soft">
          {SCOPES.map((scope) => {
            const { label, description, Icon } = SCOPE_INFO[scope];
            return (
              <div key={scope} className="flex items-center gap-2">
                <Icon width={18} height={18} />
                <span>
                  {label}: {description}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl bg-ink/[0.04] px-4 py-3 text-sm">
        <span
          role="status"
          className={
            readState === 'error' || (readState === 'ready' && !status?.running)
              ? 'text-negative'
              : readState === 'ready'
                ? 'text-positive'
                : 'text-ink-soft'
          }
        >
          {readState === 'loading'
            ? 'Reading MCP status…'
            : readState === 'error'
              ? 'MCP status unavailable.'
              : status?.running
                ? 'Running'
                : 'Stopped'}
        </span>
        {readState === 'ready' && status && (
          <>
            <span className="text-ink-soft">{status.toolCount} tools</span>
            <span className="text-ink-faint">Surface v{status.toolSurfaceVersion}</span>
          </>
        )}
        {readState === 'error' && (
          <Button
            variant="secondary"
            size="sm"
            aria-label="Retry MCP status"
            title="Retry MCP status"
            onClick={() => {
              setReadState('loading');
              void readStatus();
            }}
          >
            <RefreshIcon width={18} height={18} />
          </Button>
        )}
      </div>
      {readState === 'ready' && status?.companion && (
        <div className="mb-5 rounded-2xl bg-ink/[0.04] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <SettingsSubsectionHeading className="font-display text-base text-ink">
              MCP client configuration
            </SettingsSubsectionHeading>
            <Button variant="secondary" size="sm" onClick={() => void copyConfiguration()}>
              Copy
            </Button>
          </div>
          <pre
            aria-label="MCP client configuration"
            className="mt-2 select-text overflow-x-auto whitespace-pre-wrap break-all text-xs text-ink"
          >
            {JSON.stringify(
              {
                mcpServers: {
                  lacuna: {
                    command: status.companion.command,
                    args: status.companion.args,
                    ...(status.companion.env ? { env: status.companion.env } : {}),
                  },
                },
              },
              null,
              2,
            )}
          </pre>
        </div>
      )}
      {readState === 'ready' && (
        <div className="space-y-4">
          {visibleConnections.length === 0 && (
            <p className="rounded-3xl bg-ink/[0.03] p-5 text-sm text-ink-faint">
              No MCP clients connected.
            </p>
          )}
          {visibleConnections.map((connection) => (
            <div key={connection.connectionId} className="rounded-3xl bg-ink/[0.03] p-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-sm font-semibold text-ink">
                  {connection.name}
                  {connection.version ? ` ${connection.version}` : ''}
                </div>
                <div className="text-xs text-ink-faint">{connection.connectionId.slice(0, 8)}</div>
              </div>
              <div className="space-y-2">
                {rows.map((row) => {
                  const current = connection.grants.find((entry) => entry.courseId === row.id);
                  const lowerScope = current ? LOWER_SCOPE[current.scope] : undefined;
                  const higherScopes = current
                    ? SCOPES.slice(SCOPES.indexOf(current.scope) + 1)
                    : SCOPES;
                  const pending =
                    pendingGrant?.connectionId === connection.connectionId &&
                    pendingGrant.courseId === row.id
                      ? pendingGrant
                      : null;
                  return (
                    <div
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-ink">{row.name}</div>
                        <div className="text-xs text-ink-faint">
                          {current ? `${SCOPE_INFO[current.scope].label} access` : 'No access'}
                        </div>
                      </div>
                      <ConfirmInlineSwap
                        active={pending !== null}
                        message={
                          pending
                            ? `Allow ${connection.name}${connection.connectionId === '__embedded__' ? '' : ` (${connection.connectionId.slice(0, 8)})`} to ${SCOPE_INFO[pending.scope].description} — ${row.name}?`
                            : ''
                        }
                        confirmLabel="Allow"
                        disabled={grantBusy}
                        variant={pending?.scope === 'destructive' ? 'destructive' : 'default'}
                        onCancel={() => setPendingGrant(null)}
                        onConfirm={async () => {
                          if (!pending || readState !== 'ready') return;
                          await setGrant(connection.connectionId, row.id, pending.scope, row.name);
                          setPendingGrant(null);
                        }}
                      >
                        <div className="flex flex-wrap gap-1">
                          {higherScopes.map((scope) => {
                            const { Icon, label, description } = SCOPE_INFO[scope];
                            return (
                              <Button
                                key={scope}
                                variant="ghost"
                                size="sm"
                                disabled={grantBusy}
                                title={description}
                                onClick={() =>
                                  setPendingGrant({
                                    connectionId: connection.connectionId,
                                    courseId: row.id,
                                    scope,
                                  })
                                }
                              >
                                <Icon width={16} height={16} />
                                {label}
                              </Button>
                            );
                          })}
                          {lowerScope && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={grantBusy}
                              onClick={() =>
                                void setGrant(connection.connectionId, row.id, lowerScope, row.name)
                              }
                            >
                              Limit to {SCOPE_INFO[lowerScope].label.toLowerCase()}
                            </Button>
                          )}
                          {current && (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={grantBusy}
                              onClick={() => void revoke(connection.connectionId, row.id)}
                            >
                              Revoke
                            </Button>
                          )}
                        </div>
                      </ConfirmInlineSwap>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  );
}
