/// <reference types="vite/client" />

import type { McpConsentRequest, McpConsentResponse, McpGrantNotice, McpInvokeRequest, McpInvokeResponse, McpScope, McpScopeResolutionRequest, McpScopeResolutionResponse } from './mcp/bridge/protocol';
import type { McpGrant } from './mcp/types';
import type { McpClientConnection } from './mcp/connections';

export {};

declare global {
  const __VERCEL_ANALYTICS_ENABLED__: boolean;

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
        getStatus: () => Promise<{
          running: boolean;
          toolCount: number;
          toolSurfaceVersion: number;
          clients?: McpClientConnection[];
          companion?: { command: string; args: string[] };
        }>;
        getGrants: () => Promise<McpGrant[]>;
        grant: (courseId: string, scope: McpScope, label?: string) => Promise<McpGrant>;
        revoke: (courseId: string) => Promise<void>;
        getConnections?: () => Promise<McpClientConnection[]>;
        grantConnection?: (connectionId: string, courseId: string, scope: McpScope, label?: string) => Promise<McpGrant>;
        revokeConnection?: (connectionId: string, courseId: string) => Promise<void>;
        onConsentRequest: (callback: (request: McpConsentRequest) => void) => () => void;
        replyConsent: (response: McpConsentResponse) => void;
        onGrantNotice: (callback: (notice: McpGrantNotice) => void) => () => void;
        onScopeResolutionRequest: (callback: (request: McpScopeResolutionRequest) => void) => () => void;
        replyScopeResolution: (response: McpScopeResolutionResponse) => void;
        /** Subscribes to tool invocations forwarded from the main process. Returns an unsubscribe function. */
        onInvoke: (callback: (request: McpInvokeRequest) => void) => () => void;
        /** Sends a tool's result back to the main process, correlated by request id. */
        reply: (response: McpInvokeResponse) => void;
      };
    };
  }
}
