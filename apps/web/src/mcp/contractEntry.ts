// Explicit cross-runtime surface; keep exports limited to the consuming runtimes.
export {
  MCP_TOOL_SURFACE_VERSION,
  TOOL_CONTRACT_REGISTRY,
  getToolContract,
  unknownToolMessage,
} from './contracts/registry.js';
export type { McpGrant, ToolContract } from './types.js';
