import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, type CallToolResult } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const packageVersion = (require('../../package.json') as { version: string }).version;
const expectedTools = [
  'lacuna.connect',
  'lacuna.disconnect',
  'lacuna.invoke_tool',
  'lacuna.reply',
  'lacuna.wait_for_message',
];

function electronExecutable(): string {
  const executablePath: unknown = require('electron');
  if (typeof executablePath !== 'string') {
    throw new Error('Electron did not resolve to its platform executable.');
  }
  return executablePath;
}

function toolData(result: CallToolResult): Record<string, unknown> {
  const text = result.content.find((entry) => entry.type === 'text');
  if (result.isError || text?.type !== 'text') {
    const detail = text?.type === 'text' ? text.text : 'No text result was returned.';
    throw new Error(`Lacuna AI tool failed: ${detail}`);
  }
  return JSON.parse(text.text) as Record<string, unknown>;
}

async function startCompanion(
  executablePath: string,
  hostProfile: string,
  name: string,
): Promise<Client> {
  let stderr = '';
  const transport = new StdioClientTransport({
    command: executablePath,
    args: [
      path.join(root, 'electron', 'dist-electron', 'mcp', 'aiCompanionEntry.js'),
      `--lacuna-host-user-data-dir=${hostProfile}`,
      `--lacuna-app-version=${packageVersion}`,
    ],
    env: {
      ELECTRON_RUN_AS_NODE: '1',
    },
    stderr: 'pipe',
  });
  transport.stderr?.setEncoding('utf8');
  transport.stderr?.on('data', (chunk: string) => {
    stderr += chunk;
    process.stderr.write(`[Lacuna AI companion] ${chunk}`);
  });
  const client = new Client({ name, version: '1.0.0' });
  try {
    await client.connect(transport);
  } catch (error) {
    const detail = stderr.trim() || 'The companion wrote no diagnostic output.';
    throw new Error(`The Lacuna AI companion failed to start: ${detail}`, { cause: error });
  }
  return client;
}

test('the enabled Electron renderer accepts a companion and completes a message cycle', async () => {
  test.skip(
    process.platform !== 'darwin' && process.platform !== 'win32',
    'The release gate runs against the supported macOS and Windows desktop builds.',
  );

  const profile = await realpath(await mkdtemp(path.join(tmpdir(), 'lacuna-electron-ai-')));
  const executablePath = electronExecutable();
  let app: ElectronApplication | undefined;
  let client: Client | undefined;

  try {
    app = await electron.launch({
      executablePath,
      args: [root, `--user-data-dir=${profile}`],
    });
    const page = await app.firstWindow();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1200,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.waitForLoadState('domcontentloaded');
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const openLacuna = page
      .getByRole('navigation', { name: 'Landing navigation' })
      .getByRole('link', { name: 'Open Lacuna', exact: true });
    await expect(openLacuna).toBeVisible();
    await openLacuna.click();
    await page.waitForURL((url) => url.hash === '#/');
    await expect(page.getByRole('link', { name: 'Settings', exact: true }).first()).toBeVisible();
    await page.getByRole('link', { name: 'Settings', exact: true }).first().click();

    await expect(page.getByRole('heading', { name: 'Install & updates' })).toBeVisible();
    await expect(
      page.getByText('This development build does not check for packaged updates.'),
    ).toBeVisible();

    const enableAi = page.getByRole('switch', { name: 'Enable AI' });
    await expect(enableAi).toBeVisible();
    await enableAi.click();
    await expect(enableAi).toHaveAttribute('aria-checked', 'true');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(enableAi).toHaveAttribute('aria-checked', 'true');

    const openAi = page.getByRole('button', { name: 'AI', exact: true }).first();
    await expect(openAi).toBeVisible();
    await openAi.click();
    const panel = page.getByRole('complementary', { name: 'AI conversation' });
    await expect(panel).toBeVisible();
    const composer = panel.getByRole('textbox', { name: 'Message AI' });
    await expect(composer).toBeDisabled();

    client = await startCompanion(executablePath, profile, 'Playwright native transport');

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(expectedTools);

    const connection = toolData(await client.callTool({ name: 'lacuna.connect', arguments: {} }));
    expect(connection.connectionId).toEqual(expect.any(String));
    await expect(panel.getByText('Playwright native transport', { exact: true })).toBeVisible();

    await expect(composer).toBeEnabled();
    await composer.fill('Native transport lifecycle probe');
    await panel.getByRole('button', { name: 'Send message' }).click();

    const claim = toolData(
      await client.callTool({
        name: 'lacuna.wait_for_message',
        arguments: { timeoutMs: 1_000 },
      }),
    );
    expect(claim).toMatchObject({
      type: 'message',
      content: 'Native transport lifecycle probe',
      runId: expect.any(String),
      messageId: expect.any(String),
    });

    const catalogue = toolData(
      await client.callTool({
        name: 'lacuna.invoke_tool',
        arguments: {
          runId: claim.runId,
          callId: 'catalogue-call-1',
          toolName: 'lacuna.list_tools',
          input: { query: 'course', limit: 5 },
        },
      }),
    );
    expect(catalogue).toMatchObject({
      ok: true,
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({ name: 'lacuna.find_course', requiredScope: 'read' }),
        ]),
      },
    });

    const reply = 'Transport reply recorded by the Playwright harness.';
    const replyArguments = {
      runId: claim.runId,
      messageId: claim.messageId,
      content: reply,
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(
        toolData(
          await client.callTool({
            name: 'lacuna.reply',
            arguments: replyArguments,
          }),
        ),
      ).toMatchObject({ replied: true, runId: claim.runId, messageId: claim.messageId });
    }
    await expect(panel.getByText(reply, { exact: true })).toBeVisible();
    await expect(panel.getByText(reply, { exact: true })).toHaveCount(1);

    expect(
      toolData(await client.callTool({ name: 'lacuna.disconnect', arguments: {} })),
    ).toMatchObject({ disconnected: true });
    await client.close();
    client = undefined;

    await page.reload({ waitUntil: 'commit' });
    client = await startCompanion(executablePath, profile, 'Playwright reload probe');
    const reconnecting = client.callTool({ name: 'lacuna.connect', arguments: {} });
    await page.waitForLoadState('domcontentloaded');
    expect(toolData(await reconnecting).connectionId).toEqual(expect.any(String));

    await expect(enableAi).toHaveAttribute('aria-checked', 'true');
    await expect(openAi).toBeVisible();
    await openAi.click();
    await expect(panel.getByText('Playwright reload probe', { exact: true })).toBeVisible();
    expect(
      toolData(await client.callTool({ name: 'lacuna.disconnect', arguments: {} })),
    ).toMatchObject({ disconnected: true });
  } finally {
    await client?.close().catch(() => undefined);
    await app?.close().catch(() => undefined);
    await rm(profile, { recursive: true, force: true });
  }
});
