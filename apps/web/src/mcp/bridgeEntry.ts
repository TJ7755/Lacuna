// Explicit cross-runtime surface; keep exports limited to the consuming runtimes.
export { ConsentCoordinator } from './bridge/consentCoordinator.js';
export { InvokeDispatcher } from './bridge/dispatcher.js';
export { McpConnectionStore } from './connections.js';
export { GrantStore, courseIdOrGlobal, resolveGrant } from './grants.js';
