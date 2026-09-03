import { z } from 'zod';
import { MCP_TOOL_NAME_MAX_LENGTH } from '../limits';
import type { ToolContract } from '../types';
import { CONTENT_TOOL_CONTRACTS } from './content';
import { DESTRUCTIVE_TOOL_CONTRACTS } from './destructive';
import { IMPORT_TOOL_CONTRACTS } from './import';
import { LINEAGE_TOOL_CONTRACTS } from './lineage';
import { READ_TOOL_CONTRACTS } from './read';
import { QUESTION_TOOL_CONTRACTS } from './questions';
import { MEMORY_TOOL_CONTRACTS } from './memories';

/** Versions names and wire shapes independently of the database schema. */
export const MCP_TOOL_SURFACE_VERSION = 3;

export const listToolsContract = {
  name: 'lacuna.list_tools',
  description:
    'Search the Lacuna domain-tool catalogue, including descriptions, input schemas and permission levels. Use this before guessing a tool name.',
  inputSchema: z.object({
    query: z.string().trim().max(200).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    cursor: z.string().max(100).optional(),
  }).strict(),
  requiredScope: 'read',
} satisfies ToolContract;

export const TOOL_CONTRACT_REGISTRY = [
  listToolsContract,
  ...READ_TOOL_CONTRACTS,
  ...CONTENT_TOOL_CONTRACTS,
  ...QUESTION_TOOL_CONTRACTS,
  ...DESTRUCTIVE_TOOL_CONTRACTS,
  ...IMPORT_TOOL_CONTRACTS,
  ...LINEAGE_TOOL_CONTRACTS,
  ...MEMORY_TOOL_CONTRACTS,
] as const satisfies readonly ToolContract[];

export function getToolContract(name: string): ToolContract | undefined {
  return TOOL_CONTRACT_REGISTRY.find((tool) => tool.name === name);
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + Number(left[leftIndex - 1] !== right[rightIndex - 1]),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function comparableToolName(name: string): string {
  return name.replace(/^lacuna\./, '').replace(/decks?/g, 'course').replace(/banks?/g, 'card');
}

export function suggestToolNames(name: string, limit = 3): string[] {
  if (name.length > MCP_TOOL_NAME_MAX_LENGTH) return [];
  const wanted = comparableToolName(name);
  const maximumDistance = Math.max(2, Math.floor(wanted.length * 0.35));
  return TOOL_CONTRACT_REGISTRY
    .map((tool) => ({ tool: tool.name, distance: editDistance(wanted, comparableToolName(tool.name)) }))
    .filter(({ distance }) => distance <= maximumDistance)
    .sort((left, right) => left.distance - right.distance || left.tool.localeCompare(right.tool))
    .slice(0, limit)
    .map(({ tool }) => tool);
}

export function unknownToolMessage(name: string): string {
  if (name.length > MCP_TOOL_NAME_MAX_LENGTH) {
    return 'Unknown tool name is too long. Use lacuna.list_tools to search the catalogue.';
  }
  const suggestions = suggestToolNames(name);
  return suggestions.length > 0
    ? `Unknown tool "${name}". Did you mean ${suggestions.join(', ')}? Use lacuna.list_tools to search the catalogue.`
    : `Unknown tool "${name}". Use lacuna.list_tools to search the catalogue.`;
}
