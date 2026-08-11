import { GrantStore, type McpScope } from './grants';
import type { McpGrant } from './types';

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

interface ConnectionEntry {
  identity: McpClientIdentity;
  connectedAt: number;
  lastActivityAt: number;
  grants: GrantStore;
}

/** In-memory client and grant state. Closing a connection destroys every grant it owned. */
export class McpConnectionStore {
  private readonly entries = new Map<string, ConnectionEntry>();

  connect(identity: McpClientIdentity, now = Date.now()): McpClientConnection {
    if (this.entries.has(identity.connectionId)) {
      throw new Error(`MCP connection "${identity.connectionId}" is already active.`);
    }
    const entry: ConnectionEntry = {
      identity,
      connectedAt: now,
      lastActivityAt: now,
      grants: new GrantStore(),
    };
    this.entries.set(identity.connectionId, entry);
    return this.snapshot(entry);
  }

  disconnect(connectionId: string): void {
    this.entries.delete(connectionId);
  }

  touch(connectionId: string, now = Date.now()): void {
    const entry = this.require(connectionId);
    entry.lastActivityAt = now;
  }

  updateIdentity(identity: McpClientIdentity): void {
    const entry = this.require(identity.connectionId);
    entry.identity = identity;
  }

  grants(connectionId: string): GrantStore {
    return this.require(connectionId).grants;
  }

  setGrant(connectionId: string, courseId: string, scope: McpScope, label?: string): McpGrant {
    return this.grants(connectionId).setScope(courseId, scope, label);
  }

  revoke(connectionId: string, courseId: string): void {
    this.grants(connectionId).revoke(courseId);
  }

  list(): McpClientConnection[] {
    return [...this.entries.values()].map((entry) => this.snapshot(entry));
  }

  private require(connectionId: string): ConnectionEntry {
    const entry = this.entries.get(connectionId);
    if (!entry) throw new Error(`Unknown MCP connection "${connectionId}".`);
    return entry;
  }

  private snapshot(entry: ConnectionEntry): McpClientConnection {
    return {
      ...entry.identity,
      connectedAt: entry.connectedAt,
      lastActivityAt: entry.lastActivityAt,
      grants: entry.grants.list(),
    };
  }
}
