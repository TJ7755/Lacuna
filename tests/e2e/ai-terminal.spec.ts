import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { createHandler } from '../../relay/src/relay.js';
import { MemoryStore } from '../../relay/src/store.js';
import { TerminalAiClient } from '../../tooling/lacuna-ai-mcp/src/client.js';
import { HttpTerminalRelayTransport } from '../../tooling/lacuna-ai-mcp/src/relayTransport.js';

const RELAY_URL = 'https://lacuna-relay.vercel.app';
const PAIRING_CODE_RE = /\b[A-HJ-KM-NP-TV-Z2-9]{4}(?:-[A-HJ-KM-NP-TV-Z2-9]{4}){4}\b/;

test('pairs with a terminal and exchanges an encrypted reply', async ({ page }) => {
  const { composer, terminal } = await pairBrowserAndTerminal(page);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await expect(terminal.waitForMessage(250)).resolves.toEqual({ type: 'empty' });
  }

  await composer.fill('Explain the testing effect.');
  await page.getByRole('button', { name: 'Send message' }).click();
  const claimed = await terminal.waitForMessage(250);
  expect(claimed).toEqual(
    expect.objectContaining({
      type: 'message',
      content: 'Explain the testing effect.',
    }),
  );
  if (claimed.type !== 'message') throw new Error('Expected the terminal to claim the message.');

  const reply = 'Retrieval strengthens later access more than passive rereading.';
  await terminal.reply(claimed.runId, claimed.messageId, reply);

  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  await terminal.disconnect();
});

test('restores and claims an unclaimed message once after a browser reload', async ({ page }) => {
  const { composer, terminal } = await pairBrowserAndTerminal(page);
  const message = 'Keep this pending through a reload.';

  await composer.fill(message);
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.reload();
  const panel = page.getByRole('complementary', { name: 'AI conversation' });
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: 'AI', exact: true }).first().click();
  }
  await expect(panel).toBeVisible();
  await expect(page.getByText(message, { exact: true })).toBeVisible();

  const claimed = await terminal.waitForMessage(250);
  if (claimed.type !== 'message') throw new Error('Expected the terminal to claim the message.');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(terminal.waitForMessage(250)).resolves.toEqual({ type: 'empty' });

  const reply = 'The pending run survived the reload.';
  await terminal.reply(claimed.runId, claimed.messageId, reply);
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  await terminal.disconnect();
});

test('shows the terminal acknowledgement after Stop', async ({ page }) => {
  const { composer, terminal } = await pairBrowserAndTerminal(page);

  await composer.fill('Stop this terminal run.');
  await page.getByRole('button', { name: 'Send message' }).click();
  const claimed = await terminal.waitForMessage(250);
  if (claimed.type !== 'message') throw new Error('Expected the terminal to claim the message.');

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(terminal.waitForMessage(1_000)).resolves.toEqual({
    type: 'stop_requested',
    messageId: claimed.messageId,
    runId: claimed.runId,
  });
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Further AI bridge actions are blocked. Completed changes remain.', {
      exact: true,
    }),
  ).toBeVisible();
  const lateReply = 'This late reply must not appear.';
  await expect(terminal.reply(claimed.runId, claimed.messageId, lateReply)).rejects.toThrow(
    'The supplied run and message are not active in this terminal session.',
  );
  await expect(page.getByText(lateReply, { exact: true })).toHaveCount(0);
  await terminal.disconnect();
});

async function pairBrowserAndTerminal(
  page: Page,
): Promise<{ composer: Locator; terminal: TerminalAiClient }> {
  const handleRelayRequest = createHandler(new MemoryStore());
  await page.route(`${RELAY_URL}/**`, (route) => relayRoute(route, handleRelayRequest));

  await page.goto('/');
  await page.getByRole('button', { name: 'Create your first course' }).click();
  await page.goto('/#/settings#settings-ai');
  await page.getByRole('switch', { name: 'Enable AI' }).click();
  await page.getByRole('button', { name: 'AI', exact: true }).first().click();
  await expect(page.getByRole('complementary', { name: 'AI conversation' })).toBeVisible();
  await page.getByRole('button', { name: 'Connect terminal' }).click();

  const instruction = page.getByRole('textbox', { name: 'Terminal instruction' });
  const pairingCode = (await instruction.inputValue()).match(PAIRING_CODE_RE)?.[0];
  expect(pairingCode).toBeTruthy();
  await expect(page.locator('p').getByText(pairingCode!, { exact: true })).toBeVisible();
  await expect(instruction).toHaveValue(
    `Connect to Lacuna with code ${pairingCode}, then wait for messages until I ask you to disconnect.`,
  );
  const composer = page.getByRole('textbox', { name: 'Message AI' });
  await expect(composer).toBeDisabled();

  let terminalNow = Date.now();
  let terminalSequence = 0;
  const terminal = new TerminalAiClient({
    transport: new HttpTerminalRelayTransport({ fetchImpl: relayFetch(handleRelayRequest) }),
    now: () => terminalNow,
    sleep: async (milliseconds) => {
      terminalNow += milliseconds;
    },
    createId: (prefix) => `${prefix}-playwright-${++terminalSequence}`,
  });
  await terminal.connect(pairingCode!, RELAY_URL, { name: 'Playwright terminal' });

  await expect(composer).toBeEnabled();
  await expect(page.getByText('Playwright terminal', { exact: true })).toBeVisible();
  return { composer, terminal };
}

async function relayRoute(
  route: Route,
  handle: (request: Request) => Promise<Response>,
): Promise<void> {
  const intercepted = route.request();
  const method = intercepted.method();
  const body = intercepted.postDataBuffer() ?? undefined;
  const headers = new Headers(intercepted.headers());
  if (body && !headers.has('Content-Length')) {
    headers.set('Content-Length', String(body.byteLength));
  }
  const response = await handle(
    new Request(intercepted.url(), {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
    }),
  );
  await route.fulfill({
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: Buffer.from(await response.arrayBuffer()),
  });
}

function relayFetch(handle: (request: Request) => Promise<Response>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (!headers.has('Content-Length')) {
      if (typeof init?.body === 'string') {
        headers.set('Content-Length', String(new TextEncoder().encode(init.body).byteLength));
      } else if (init?.body instanceof Blob) {
        headers.set('Content-Length', String(init.body.size));
      }
    }
    return handle(new Request(input, { ...init, headers }));
  }) as typeof fetch;
}
