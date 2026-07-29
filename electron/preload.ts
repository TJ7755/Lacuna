import { contextBridge, ipcRenderer } from 'electron';

// The mcp.onInvoke/reply payloads are plain JSON envelopes (src/mcp/bridge/protocol.ts);
// typed loosely here since the preload script's own tsconfig (tsconfig.preload.json) does
// not include src/, to keep its CommonJS build independent of the app's module graph.
type McpGrant = { courseId: string; scope: 'read' | 'write' | 'destructive'; grantedAt: number; label?: string };
type McpInvokeRequest = { id: string; tool: string; input: unknown; agentId: string; grant: McpGrant };
type McpInvokeResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: { kind: string; message: string } };
type McpScope = 'read' | 'write' | 'destructive';
type McpConsentRequest = { id: string; tool: string; courseId: string; scope: 'write' | 'destructive' };
type McpConsentResponse = { id: string; approved: boolean };
type McpGrantNotice = { courseId: string; tool: string };
type McpScopeResolutionRequest = { id: string; tool: string; input: unknown };
type McpScopeResolutionResponse = { id: string; ok: true; targets: { courseId: string; label?: string }[] } | { id: string; ok: false; error: { kind: string; message: string } };

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
  // Narrow surface for the stdio MCP server hosted in the main process (Arc 2, Task 9).
  // No raw ipcRenderer passthrough, matching the rest of this file's pattern.
  mcp: {
    getStatus: () => ipcRenderer.invoke('mcp:status'),
    getGrants: () => ipcRenderer.invoke('mcp:grants:list'),
    grant: (courseId: string, scope: McpScope, label?: string) =>
      ipcRenderer.invoke('mcp:grants:grant', courseId, scope, label),
    revoke: (courseId: string) => ipcRenderer.invoke('mcp:grants:revoke', courseId),
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
    replyScopeResolution: (response: McpScopeResolutionResponse) => ipcRenderer.send('mcp:scope:reply', response),
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
