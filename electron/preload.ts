import { contextBridge, ipcRenderer } from 'electron';
import type { ManualUpdateReason, UpdatePhase, UpdateState } from './updaterContract';

// The mcp.onInvoke/reply payloads are plain JSON envelopes (src/mcp/bridge/protocol.ts);
// typed loosely here since the preload script's own tsconfig (tsconfig.preload.json) does
// not include src/, to keep its CommonJS build independent of the app's module graph.
type McpGrant = {
  courseId: string;
  scope: 'read' | 'write' | 'destructive';
  grantedAt: number;
  label?: string;
};
type McpInvokeRequest = {
  id: string;
  tool: string;
  input: unknown;
  agentId: string;
  grant: McpGrant;
};
type McpInvokeResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: { kind: string; message: string } };
type McpScope = 'read' | 'write' | 'destructive';
type McpClientIdentity = { connectionId: string; name: string; version?: string };
type McpConsentRequest = {
  id: string;
  tool: string;
  courseId: string;
  scope: 'write' | 'destructive';
  client?: McpClientIdentity;
};
type McpConsentResponse = { id: string; approved: boolean };
type McpGrantNotice = { courseId: string; tool: string; client?: McpClientIdentity };
type McpClientConnection = McpClientIdentity & {
  connectedAt: number;
  lastActivityAt: number;
  grants: McpGrant[];
};
type McpScopeResolutionRequest = { id: string; tool: string; input: unknown };
type McpScopeResolutionResponse =
  | { id: string; ok: true; targets: { courseId: string; label?: string }[] }
  | { id: string; ok: false; error: { kind: string; message: string } };
type AiBridgeRequest = Record<string, unknown> & { type: string };
type AiBridgeResult =
  | { ok: true; data: unknown }
  | { ok: false; error: Record<string, unknown> & { kind: string; message: string } };
const UPDATE_PHASES = new Set<UpdatePhase>([
  'idle',
  'checking',
  'available',
  'downloading',
  'downloaded',
  'up-to-date',
  'error',
  'manual',
]);
const MANUAL_REASONS = new Set<ManualUpdateReason>([
  'development',
  'unsigned-macos',
  'windows-portable',
  'linux-deb',
]);

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function safeUpdateState(value: unknown): UpdateState | undefined {
  const item = record(value);
  if (
    !item ||
    !UPDATE_PHASES.has(item.phase as UpdatePhase) ||
    (item.mode !== 'automatic' && item.mode !== 'manual') ||
    typeof item.currentVersion !== 'string'
  )
    return undefined;
  if (item.availableVersion !== undefined && typeof item.availableVersion !== 'string')
    return undefined;
  if (item.error !== undefined && typeof item.error !== 'string') return undefined;
  if (
    item.manualReason !== undefined &&
    !MANUAL_REASONS.has(item.manualReason as ManualUpdateReason)
  ) {
    return undefined;
  }
  const progress = item.progress === undefined ? undefined : record(item.progress);
  if (
    item.progress !== undefined &&
    (!progress ||
      !['percent', 'transferred', 'total', 'bytesPerSecond'].every(
        (key) => typeof progress[key] === 'number' && Number.isFinite(progress[key]),
      ))
  )
    return undefined;
  return {
    phase: item.phase as UpdatePhase,
    mode: item.mode,
    currentVersion: item.currentVersion,
    ...(typeof item.availableVersion === 'string'
      ? { availableVersion: item.availableVersion }
      : {}),
    ...(typeof item.manualReason === 'string'
      ? { manualReason: item.manualReason as ManualUpdateReason }
      : {}),
    ...(progress
      ? {
          progress: {
            percent: progress.percent as number,
            transferred: progress.transferred as number,
            total: progress.total as number,
            bytesPerSecond: progress.bytesPerSecond as number,
          },
        }
      : {}),
    ...(typeof item.error === 'string' ? { error: item.error } : {}),
  };
}

function aiRequestEnvelope(value: unknown):
  | {
      channelId: string;
      id: string;
      request: AiBridgeRequest;
    }
  | undefined {
  const item = record(value);
  const request = record(item?.request);
  if (
    !item ||
    Object.keys(item).length !== 3 ||
    typeof item.channelId !== 'string' ||
    item.channelId.length === 0 ||
    typeof item.id !== 'string' ||
    item.id.length === 0 ||
    !request ||
    typeof request.type !== 'string'
  )
    return undefined;
  return { channelId: item.channelId, id: item.id, request: request as AiBridgeRequest };
}

function aiDisconnectEnvelope(value: unknown): { channelId: string } | undefined {
  const item = record(value);
  return item &&
    Object.keys(item).length === 1 &&
    typeof item.channelId === 'string' &&
    item.channelId.length > 0
    ? { channelId: item.channelId }
    : undefined;
}

function safeAiResult(value: unknown): AiBridgeResult {
  const item = record(value);
  if (item && Object.keys(item).length === 2 && item.ok === true) {
    const data = record(item.data);
    if (data && typeof data.type === 'string') return value as AiBridgeResult;
  }
  if (item && Object.keys(item).length === 2 && item.ok === false) {
    const error = record(item.error);
    if (error && typeof error.kind === 'string') return value as AiBridgeResult;
  }
  return {
    ok: false,
    error: { kind: 'internal', message: 'The local AI renderer returned an invalid response.' },
  };
}

let aiRendererSubscriptionId = 0;

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
    const handler = (_event: unknown, value: boolean) => callback(value);
    ipcRenderer.on('window:maximizedChange', handler);
    return () => {
      ipcRenderer.removeListener('window:maximizedChange', handler);
    };
  },
  onOpenHelp: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('navigation:open-help', handler);
    return () => ipcRenderer.removeListener('navigation:open-help', handler);
  },
  updater: {
    getState: async (): Promise<UpdateState> => {
      const state = safeUpdateState(await ipcRenderer.invoke('updater:get-state'));
      if (!state) throw new Error('The desktop updater returned invalid status.');
      return state;
    },
    checkForUpdates: (): Promise<void> => ipcRenderer.invoke('updater:check'),
    restartAndInstall: (): Promise<void> => ipcRenderer.invoke('updater:restart-and-install'),
    onStateChange: (callback: (state: UpdateState) => void) => {
      const handler = (_event: unknown, value: unknown) => {
        const state = safeUpdateState(value);
        if (state) callback(state);
      };
      ipcRenderer.on('updater:state', handler);
      return () => ipcRenderer.removeListener('updater:state', handler);
    },
  },
  ai: {
    protocolVersion: 1,
    disconnect: (channelId: string) => ipcRenderer.send('ai:disconnect-channel', channelId),
    requestRestart: (): Promise<void> => ipcRenderer.invoke('ai:restart-renderer'),
    onRestartRequested: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('ai:restart-requested', handler);
      return () => ipcRenderer.removeListener('ai:restart-requested', handler);
    },
    listen: (
      onRequest: (channelId: string, request: AiBridgeRequest) => Promise<AiBridgeResult>,
      onDisconnected: (channelId: string) => void,
    ) => {
      const subscriptionId = ++aiRendererSubscriptionId;
      let active = true;
      let ready = false;
      const requestHandler = (_event: unknown, value: unknown) => {
        const envelope = aiRequestEnvelope(value);
        if (!active || !envelope) return;
        void Promise.resolve(onRequest(envelope.channelId, envelope.request))
          .then((result) => {
            ipcRenderer.send('ai:reply', {
              channelId: envelope.channelId,
              id: envelope.id,
              result: safeAiResult(result),
            });
          })
          .catch(() => {
            ipcRenderer.send('ai:reply', {
              channelId: envelope.channelId,
              id: envelope.id,
              result: {
                ok: false,
                error: { kind: 'internal', message: 'The local AI renderer request failed.' },
              },
            });
          });
      };
      const disconnectHandler = (_event: unknown, value: unknown) => {
        const envelope = aiDisconnectEnvelope(value);
        if (active && envelope) onDisconnected(envelope.channelId);
      };
      const readyHandler = (_event: unknown, acknowledgedId: unknown) => {
        if (acknowledgedId !== subscriptionId) return;
        ready = true;
        clearInterval(readyTimer);
      };
      ipcRenderer.on('ai:request', requestHandler);
      ipcRenderer.on('ai:disconnected', disconnectHandler);
      ipcRenderer.on('ai:renderer-ready-ack', readyHandler);
      const announceReady = () => {
        if (!ready) ipcRenderer.send('ai:renderer-ready', subscriptionId);
      };
      announceReady();
      const readyTimer = setInterval(announceReady, 250);
      return () => {
        if (!active) return;
        active = false;
        ipcRenderer.removeListener('ai:request', requestHandler);
        ipcRenderer.removeListener('ai:disconnected', disconnectHandler);
        ipcRenderer.removeListener('ai:renderer-ready-ack', readyHandler);
        clearInterval(readyTimer);
        ipcRenderer.send('ai:renderer-unavailable', subscriptionId);
      };
    },
  },
  // Narrow surface for the stdio MCP server hosted in the main process (Arc 2, Task 9).
  // No raw ipcRenderer passthrough, matching the rest of this file's pattern.
  mcp: {
    getStatus: () => ipcRenderer.invoke('mcp:status'),
    getGrants: () => ipcRenderer.invoke('mcp:grants:list'),
    grant: (courseId: string, scope: McpScope, label?: string) =>
      ipcRenderer.invoke('mcp:grants:grant', courseId, scope, label),
    revoke: (courseId: string) => ipcRenderer.invoke('mcp:grants:revoke', courseId),
    getConnections: (): Promise<McpClientConnection[]> =>
      ipcRenderer.invoke('mcp:connections:list'),
    grantConnection: (connectionId: string, courseId: string, scope: McpScope, label?: string) =>
      ipcRenderer.invoke('mcp:connections:grant', connectionId, courseId, scope, label),
    revokeConnection: (connectionId: string, courseId: string) =>
      ipcRenderer.invoke('mcp:connections:revoke', connectionId, courseId),
    onConsentRequest: (callback: (request: McpConsentRequest) => void) => {
      const handler = (_event: unknown, request: McpConsentRequest) => callback(request);
      ipcRenderer.on('mcp:consent', handler);
      return () => ipcRenderer.removeListener('mcp:consent', handler);
    },
    replyConsent: (response: McpConsentResponse) => ipcRenderer.send('mcp:consent:reply', response),
    onGrantNotice: (callback: (notice: McpGrantNotice) => void) => {
      const handler = (_event: unknown, notice: McpGrantNotice) => callback(notice);
      ipcRenderer.on('mcp:grant-notice', handler);
      return () => ipcRenderer.removeListener('mcp:grant-notice', handler);
    },
    onScopeResolutionRequest: (callback: (request: McpScopeResolutionRequest) => void) => {
      const handler = (_event: unknown, request: McpScopeResolutionRequest) => callback(request);
      ipcRenderer.on('mcp:scope', handler);
      return () => ipcRenderer.removeListener('mcp:scope', handler);
    },
    replyScopeResolution: (response: McpScopeResolutionResponse) =>
      ipcRenderer.send('mcp:scope:reply', response),
    onInvoke: (callback: (request: McpInvokeRequest) => void) => {
      const handler = (_event: unknown, request: McpInvokeRequest) => callback(request);
      ipcRenderer.on('mcp:invoke', handler);
      return () => {
        ipcRenderer.removeListener('mcp:invoke', handler);
      };
    },
    reply: (response: McpInvokeResponse) => ipcRenderer.send('mcp:invoke:reply', response),
  },
});
