/// <reference types="vite/client" />

import type { McpInvokeRequest, McpInvokeResponse } from './mcp/bridge/protocol';

export {};

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      isElectron: boolean;
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
      isMaximized: () => Promise<boolean>;
      onMaximizedChange: (callback: (isMaximized: boolean) => void) => (() => void);
      /** The stdio MCP server hosted in the Electron main process (Arc 2, Task 9). */
      mcp?: {
        /** Current server status, for settings/McpSection.tsx (Task 11). */
        getStatus: () => Promise<{ running: boolean; toolCount: number; toolSurfaceVersion: number }>;
        /** Subscribes to tool invocations forwarded from the main process. Returns an unsubscribe function. */
        onInvoke: (callback: (request: McpInvokeRequest) => void) => () => void;
        /** Sends a tool's result back to the main process, correlated by request id. */
        reply: (response: McpInvokeResponse) => void;
      };
    };
  }
}
