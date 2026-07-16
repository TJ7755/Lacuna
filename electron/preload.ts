import { contextBridge, ipcRenderer } from 'electron';

// The mcp.onInvoke/reply payloads are plain JSON envelopes (src/mcp/bridge/protocol.ts);
// typed loosely here since the preload script's own tsconfig (tsconfig.preload.json) does
// not include src/, to keep its CommonJS build independent of the app's module graph.
type McpInvokeRequest = { id: string; tool: string; input: unknown; agentId: string };
type McpInvokeResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: { kind: string; message: string } };

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
