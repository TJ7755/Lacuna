// Explicit cross-runtime surface; keep exports limited to the consuming runtimes.
export {
  AiCompanionOperationError,
  bridgeOperationError,
  companionErrorDetails,
} from './companionErrors.js';
export {
  LACUNA_AI_PROTOCOL_VERSION,
  MAX_AI_IDENTIFIER_LENGTH,
  MAX_AI_MESSAGE_LENGTH,
  MAX_AI_WAIT_MS,
  MIN_AI_WAIT_MS,
  aiToolNameSchema,
  boundedJsonValueSchema,
} from './protocol.js';
export type {
  AiBridgeRequest,
  AiBridgeResult,
  AiClaimedMessage,
  AiClientIdentity,
  AiInstructionBundle,
  AiRunState,
  JsonValue,
} from './protocol.js';
