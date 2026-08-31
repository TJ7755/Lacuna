import { createHash } from 'node:crypto';
import { expect, type Locator, type Page, type Route } from '@playwright/test';
import { createHandler } from '../../../relay/src/relay.js';
import { MemoryStore } from '../../../relay/src/store.js';
import { TerminalAiClient } from '../../../tooling/lacuna-ai-mcp/src/client.js';
import { HttpTerminalRelayTransport } from '../../../tooling/lacuna-ai-mcp/src/relayTransport.js';

const RELAY_URL = 'https://lacuna-relay.vercel.app';
const PAIRING_CODE_RE = /\b[A-HJ-KM-NP-TV-Z2-9]{4}(?:-[A-HJ-KM-NP-TV-Z2-9]{4}){4}\b/;

export interface BrowserPutRecord {
  attemptedGeneration: string;
  committedGeneration: string;
  contentGeneration: string;
}

export interface RelayRouteOptions {
  damageFirstBrowserPut?: boolean;
  browserPuts?: BrowserPutRecord[];
}

export async function pairBrowserAndTerminal(
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
  await page.getByRole('button', { name: 'Open Lacuna', exact: true }).first().click();
  await page.goto('/#/settings#settings-ai');
  await page.getByRole('switch', { name: 'Enable AI' }).click();
  await page.getByRole('button', { name: 'AI', exact: true }).first().click();
  await expect(page.getByRole('complementary', { name: 'AI conversation' })).toBeVisible();
  await page.getByRole('button', { name: 'Connect terminal' }).click();

  const pairingCode = await pairingCodeFrom(page);
  const instruction = page.getByRole('textbox', { name: 'Terminal instruction' });
  await expect(instruction).toHaveValue(
    `Connect to Lacuna with code ${pairingCode}. If lacuna.wait_for_message is unavailable, read https://github.com/TJ7755/Lacuna#optional-desktop-ai-chat and help me set up the Lacuna terminal companion; tell me when I must restart this terminal before continuing. If it is available, keep calling lacuna.wait_for_message, and honour the returned versioned instructions for each claimed message, including permission and Stop rules, until I ask you to disconnect.`,
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

export async function pairingCodeFrom(page: Page): Promise<string> {
  const instruction = page.getByRole('textbox', { name: 'Terminal instruction' });
  const pairingCode = (await instruction.inputValue()).match(PAIRING_CODE_RE)?.[0];
  expect(pairingCode).toBeTruthy();
  await expect(page.locator('p').getByText(pairingCode!, { exact: true })).toBeVisible();
  return pairingCode!;
}

export async function connectTerminal(
  handleRelayRequest: ReturnType<typeof createHandler>,
  pairingCode: string,
  name: string,
  idScope: string,
): Promise<TerminalAiClient> {
  let terminalSequence = 0;
  const terminal = new TerminalAiClient({
    transport: new HttpTerminalRelayTransport({ fetchImpl: relayFetch(handleRelayRequest) }),
    sleep: (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, Math.min(milliseconds, 50))),
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
    if (!body) throw new Error('Expected the browser mailbox PUT to contain ciphertext.');
    const contentDigest = createHash('sha256').update(body).digest('hex');
    options.browserPuts?.push({
      attemptedGeneration: headers.get('If-Match') ?? '',
      committedGeneration: responseHeaders.get('X-Lacuna-Generation') ?? '',
      contentGeneration: `"sha256:${contentDigest}"`,
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
