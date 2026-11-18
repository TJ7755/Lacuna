export const MCP_TOOL_NAME_MAX_LENGTH = 160;
export const MCP_CONNECTION_IDENTIFIER_MAX_LENGTH = 160;
/** Grant display labels mirror the agent-memory reference label ceiling. */
export const MCP_GRANT_LABEL_MAX_LENGTH = 500;
/** A single tool call resolves to one permission scope, but the reply shape is a
 * list; cap it so a compromised renderer cannot flood main with targets. */
export const MCP_SCOPE_TARGETS_MAX_COUNT = 16;
