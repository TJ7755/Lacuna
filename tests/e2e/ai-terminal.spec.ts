import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { createHandler } from '../../relay/src/relay.js';
import { MemoryStore } from '../../relay/src/store.js';
import { TerminalAiClient } from '../../tooling/lacuna-ai-mcp/src/client.js';
import { HttpTerminalRelayTransport } from '../../tooling/lacuna-ai-mcp/src/relayTransport.js';

const RELAY_URL = 'https://lacuna-relay.vercel.app';
const PAIRING_CODE_RE = /\b[A-HJ-KM-NP-TV-Z2-9]{4}(?:-[A-HJ-KM-NP-TV-Z2-9]{4}){4}\b/;

interface BrowserPutRecord {
  attemptedGeneration: string;
  committedGeneration: string;
}

interface RelayRouteOptions {
  damageFirstBrowserPut?: boolean;
  browserPuts?: BrowserPutRecord[];
}

test('pairs with a terminal and exchanges an encrypted reply', async ({ page }) => {
  const { composer, terminal } = await pairBrowserAndTerminal(page);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await expect(terminal.waitForMessage(250)).resolves.toEqual({ type: 'empty' });
  }

  await composer.fill('Explain the testing effect.');
  await page.getByRole('button', { name: 'Send message' }).click();
  const claimed = await terminal.waitForMessage(2_000);
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
  await expect(page.getByText('Explain the testing effect.', { exact: true })).toBeVisible();
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect terminal' })).toBeVisible();
  await expect(composer).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
});

test('recovers a claimed prompt through a dead terminal replacement', async ({ page }) => {
  const { composer, terminal, handleRelayRequest } = await pairBrowserAndTerminal(page);
  const prompt = 'Recover this prompt after the terminal disappears.';

  await composer.fill(prompt);
  await page.getByRole('button', { name: 'Send message' }).click();
  const abandonedClaim = await terminal.waitForMessage(2_000);
  expect(abandonedClaim).toEqual(expect.objectContaining({ type: 'message', content: prompt }));
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();

  await page.getByRole('button', { name: 'Disconnect terminal' }).click();
  await expect(page.getByRole('button', { name: 'Connect terminal' })).toBeVisible();
  await expect(page.getByRole('article').getByText(prompt, { exact: true })).toBeVisible();
  await expect(composer).toBeDisabled();
  await expect(composer).toHaveValue(prompt);

  await page.getByRole('button', { name: 'Connect terminal' }).click();
  const replacementCode = await pairingCodeFrom(page);
  await expect(composer).toBeDisabled();
  await expect(composer).toHaveValue(prompt);

  const replacement = await connectTerminal(
    handleRelayRequest,
    replacementCode,
    'Replacement Playwright terminal',
    'replacement',
  );
  await expect(composer).toBeEnabled();
  await expect(composer).toHaveValue(prompt);

  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(composer).toHaveValue('');
  const replacementClaim = await replacement.waitForMessage(2_000);
  expect(replacementClaim).toEqual(expect.objectContaining({ type: 'message', content: prompt }));
  if (replacementClaim.type !== 'message') {
    throw new Error('Expected the replacement terminal to claim the recovered prompt.');
  }

  const reply = 'The replacement terminal completed the recovered prompt.';
  await replacement.reply(replacementClaim.runId, replacementClaim.messageId, reply);
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  await expect(composer).toHaveValue('');

  await replacement.disconnect();
  await expect(page.getByRole('button', { name: 'Connect terminal' })).toBeVisible();
  await expect(page.getByRole('article').getByText(prompt, { exact: true })).toHaveCount(2);
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  await expect(composer).toBeDisabled();
  await expect(composer).toHaveValue('');
});

test('recovers a committed browser write when Vercel strips the 200 acknowledgement', async ({
  page,
}) => {
  const browserPuts: BrowserPutRecord[] = [];
  const { composer, terminal } = await pairBrowserAndTerminal(page, {
    damageFirstBrowserPut: true,
    browserPuts,
  });

  await composer.fill('Keep this exchange after an ambiguous relay acknowledgement.');
  await page.getByRole('button', { name: 'Send message' }).click();
  const claimed = await terminal.waitForMessage(2_000);
  if (claimed.type !== 'message') throw new Error('Expected the terminal to claim the message.');

  const reply = 'The committed browser write was recovered safely.';
  await terminal.reply(claimed.runId, claimed.messageId, reply);

  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  await expect(composer).toHaveValue('');
  await expect(
    page.getByText(
      'Another Lacuna tab or window changed this AI connection. Reconnect the terminal.',
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      'The relay may have accepted this AI update, but Lacuna could not verify it. Reconnect the terminal.',
      { exact: true },
    ),
  ).toHaveCount(0);
  expect(browserPuts.length).toBeGreaterThanOrEqual(2);
  expect(browserPuts[0]?.attemptedGeneration).toBe('"0"');
  expect(browserPuts[1]?.attemptedGeneration).toBe(browserPuts[0]?.committedGeneration);
  expect(browserPuts.map((put) => put.attemptedGeneration)).not.toContain('"vercel-platform"');

  await terminal.disconnect();
});

test('restores and claims an unclaimed message once after a browser reload', async ({ page }) => {
  const { composer, terminal } = await pairBrowserAndTerminal(page);
  const message = 'Keep this pending through a reload.';

  await composer.fill(message);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(composer).toHaveValue('');
  await page.reload();
  const panel = page.getByRole('complementary', { name: 'AI conversation' });
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: 'AI', exact: true }).first().click();
  }
  await expect(panel).toBeVisible();
  await expect(page.getByText(message, { exact: true })).toBeVisible();

  const claimed = await terminal.waitForMessage(2_000);
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
  const claimed = await terminal.waitForMessage(2_000);
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
  routeOptions: RelayRouteOptions = {},
): Promise<{
  composer: Locator;
  terminal: TerminalAiClient;
  handleRelayRequest: ReturnType<typeof createHandler>;
}> {
  const handleRelayRequest = createHandler(new MemoryStore());
  await page.route(`${RELAY_URL}/**`, (route) =>
    relayRoute(route, handleRelayRequest, routeOptions),
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Create your first course' }).click();
  await page.goto('/#/settings#settings-ai');
  await page.getByRole('switch', { name: 'Enable AI' }).click();
  await page.getByRole('button', { name: 'AI', exact: true }).first().click();
  await expect(page.getByRole('complementary', { name: 'AI conversation' })).toBeVisible();
  await page.getByRole('button', { name: 'Connect terminal' }).click();

  const pairingCode = await pairingCodeFrom(page);
  const instruction = page.getByRole('textbox', { name: 'Terminal instruction' });
  await expect(instruction).toHaveValue(
    `Connect to Lacuna with code ${pairingCode}, then wait for messages until I ask you to disconnect.`,
  );
  const composer = page.getByRole('textbox', { name: 'Message AI' });
  await expect(composer).toBeDisabled();

  const terminal = await connectTerminal(
    handleRelayRequest,
    pairingCode,
    'Playwright terminal',
    'initial',
  );

  await expect(composer).toBeEnabled();
  await expect(page.getByText('Playwright terminal', { exact: true })).toBeVisible();
  return { composer, terminal, handleRelayRequest };
}

async function pairingCodeFrom(page: Page): Promise<string> {
  const instruction = page.getByRole('textbox', { name: 'Terminal instruction' });
  const pairingCode = (await instruction.inputValue()).match(PAIRING_CODE_RE)?.[0];
  expect(pairingCode).toBeTruthy();
  await expect(page.locator('p').getByText(pairingCode!, { exact: true })).toBeVisible();
  return pairingCode!;
}

async function connectTerminal(
  handleRelayRequest: ReturnType<typeof createHandler>,
  pairingCode: string,
  name: string,
  idScope: string,
): Promise<TerminalAiClient> {
  let terminalNow = Date.now();
  let terminalSequence = 0;
  const terminal = new TerminalAiClient({
    transport: new HttpTerminalRelayTransport({ fetchImpl: relayFetch(handleRelayRequest) }),
    now: () => terminalNow,
    sleep: async (milliseconds) => {
      terminalNow += milliseconds;
      await new Promise((resolve) => setTimeout(resolve, Math.min(milliseconds, 50)));
    },
    createId: (prefix) => `${prefix}-playwright-${idScope}-${++terminalSequence}`,
  });
  await terminal.connect(pairingCode, RELAY_URL, { name });
  return terminal;
}

async function relayRoute(
  route: Route,
  handle: (request: Request) => Promise<Response>,
  options: RelayRouteOptions = {},
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
  const responseHeaders = new Headers(response.headers);
  let responseBody = Buffer.from(await response.arrayBuffer());
  const isBrowserPut = method === 'PUT' && new URL(intercepted.url()).pathname.endsWith('/browser');
  if (isBrowserPut && response.status === 200) {
    options.browserPuts?.push({
      attemptedGeneration: headers.get('If-Match') ?? '',
      committedGeneration: responseHeaders.get('X-Lacuna-Generation') ?? '',
    });
    if (options.damageFirstBrowserPut && options.browserPuts?.length === 1) {
      responseHeaders.delete('X-Lacuna-Generation');
      responseHeaders.set('ETag', '"vercel-platform"');
      responseBody = Buffer.alloc(0);
    }
  }
  await route.fulfill({
    status: response.status,
    headers: Object.fromEntries(responseHeaders.entries()),
    body: responseBody,
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
