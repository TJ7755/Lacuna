import type { z } from 'zod';

/** Process-local consent: destructive implies write, and write implies read. */
export interface McpGrant {
  courseId: string;
  scope: 'read' | 'write' | 'destructive';
  grantedAt: number;
  label?: string;
}

export interface ToolContract<Input = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<Input>;
  requiredScope: 'read' | 'write' | 'destructive';
}

export interface McpClientIdentity {
  connectionId: string;
  name: string;
  version?: string;
}

export interface McpClientConnection extends McpClientIdentity {
  connectedAt: number;
  lastActivityAt: number;
  grants: McpGrant[];
}
