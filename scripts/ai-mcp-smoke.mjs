import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profile = process.env.LACUNA_MCP_SMOKE_PROFILE;
const transport = new StdioClientTransport({
  command: `${root}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`,
  args: [root, '--ai-companion', ...(profile ? [`--user-data-dir=${profile}`] : [])],
  stderr: 'inherit',
});
const client = new Client({ name: 'lacuna-ai-smoke', version: '1.0.0' });

function data(result) {
  const text = result.content?.find((entry) => entry.type === 'text')?.text;
  if (result.isError) throw new Error(`Tool returned an error: ${text}`);
  return text ? JSON.parse(text) : result.structuredContent;
}

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name).sort();
  const expected = [
    'lacuna.connect',
    'lacuna.disconnect',
    'lacuna.invoke_tool',
    'lacuna.reply',
    'lacuna.wait_for_message',
  ];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected local AI tool surface: ${names.join(', ')}`);
  }
  console.error(`AI SMOKE tools=${names.length}`);
  console.error(`AI SMOKE connection=${JSON.stringify(data(await client.callTool({ name: 'lacuna.connect', arguments: {} })))}`);
  console.error(`AI SMOKE wait=${JSON.stringify(data(await client.callTool({ name: 'lacuna.wait_for_message', arguments: { timeoutMs: 1_000 } })))}`);
  console.error(`AI SMOKE disconnect=${JSON.stringify(data(await client.callTool({ name: 'lacuna.disconnect', arguments: {} })))}`);
  console.error('AI SMOKE pass');
} finally {
  await client.close();
}
