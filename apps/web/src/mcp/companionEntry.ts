// Explicit cross-runtime surface; keep exports limited to the consuming runtimes.
export {
  AI_COMPANION_PROTOCOL_VERSION,
  CompanionLineDecoder,
  MCP_COMPANION_PROTOCOL_VERSION,
  encodeCompanionMessage,
  isAiCompanionRequest,
  isAiCompanionResponse,
  isAiRendererReply,
  isCompanionRequest,
} from './companionProtocol.js';
export type {
  AiCompanionProtocolVersion,
  AiCompanionRequest,
  AiCompanionResponse,
  AiRendererReply,
  AiRendererRequest,
  CompanionRequest,
  CompanionResponse,
} from './companionProtocol.js';
export type { McpClientConnection, McpClientIdentity } from './connections.js';
