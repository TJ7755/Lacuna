import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = '/Users/TJ7755/Documents/Coding/Lacuna';
const transport = new StdioClientTransport({
  command: `${root}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`,
  args: [
    '--remote-debugging-port=9223',
    '--user-data-dir=/private/tmp/lacuna-mcp-smoke-profile',
    root,
  ],
  stderr: 'inherit',
});
const client = new Client({ name: 'lacuna-smoke', version: '1.0.0' });

function data(result) {
  const text = result.content?.find((entry) => entry.type === 'text')?.text;
  if (result.isError) throw new Error(`Tool returned an error: ${text}`);
  return text ? JSON.parse(text) : null;
}

try {
  await client.connect(transport);
  const tools = await client.listTools();
  console.error(`SMOKE tools=${tools.tools.length}`);
  console.error(`SMOKE server=${JSON.stringify(data(await client.callTool({ name: 'lacuna.get_server_info', arguments: {} })))}`);
  await new Promise((resolve) => setTimeout(resolve, 6_000));
  console.error(`SMOKE courses=${JSON.stringify(data(await client.callTool({ name: 'lacuna.list_courses', arguments: {} })))}`);

  const stamp = Date.now();
  console.error('SMOKE waiting-for-global-write-consent');
  const createdCourse = data(await client.callTool({
    name: 'lacuna.create_course',
    arguments: { name: `Arc 2 MCP smoke ${stamp}` },
  }));
  const courseId = createdCourse.id;
  const item = { front: `ARC2-SMOKE-${stamp}`, back: 'idempotent import', tags: ['arc2-smoke'] };
  console.error(`SMOKE course=${courseId}`);

  console.error('SMOKE waiting-for-course-write-consent');
  const preview = data(await client.callTool({
    name: 'lacuna.diff_import_preview',
    arguments: { courseId, items: [item] },
  }));
  console.error(`SMOKE preview=${JSON.stringify(preview)}`);
  const firstImport = data(await client.callTool({
    name: 'lacuna.import_cards',
    arguments: { courseId, items: [item] },
  }));
  const secondImport = data(await client.callTool({
    name: 'lacuna.import_cards',
    arguments: { courseId, items: [item] },
  }));
  console.error(`SMOKE first-import=${JSON.stringify(firstImport)}`);
  console.error(`SMOKE second-import=${JSON.stringify(secondImport)}`);

  console.error('SMOKE waiting-for-destructive-consent');
  const deletion = data(await client.callTool({
    name: 'lacuna.delete_course',
    arguments: { courseId },
  }));
  console.error(`SMOKE delete-course=${JSON.stringify(deletion)}`);
  console.error('SMOKE functional-pass-complete');
} finally {
  await client.close();
}
