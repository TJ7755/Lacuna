import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { TOOL_CONTRACT_REGISTRY } from '../packages/protocol/src/mcp/contracts/registry';

// Review the readable diff and update the independent hash/version gate separately.
const surface = TOOL_CONTRACT_REGISTRY.map(({ name, description, requiredScope, inputSchema }) => ({
  name,
  description,
  requiredScope,
  inputSchema: z.toJSONSchema(inputSchema),
}));
const fixture = new URL('../apps/web/src/mcp/fixtures/tool-surface.json', import.meta.url);
await writeFile(fixture, `${JSON.stringify(surface, null, 2)}\n`);
execFileSync(process.execPath, ['fmt', fileURLToPath(fixture)], { stdio: 'inherit' });
