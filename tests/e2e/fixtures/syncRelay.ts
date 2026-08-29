import type { Page, Route } from '@playwright/test';

export const SYNC_CHANNEL_ID = '0123456789abcdef0123456789abcdef';
export const SYNC_WRITE_TOKEN = 'ab'.repeat(32);
export const SYNC_PASSPHRASE = 'recovery-passphrase-1234';

type RelaySlot = 'keybag' | 'state';

interface StoredSlot {
  bytes: Buffer;
  generation: string;
  revision: number;
}

export interface StatefulSyncRelay {
  relayBase: string;
  requests: string[];
  attach(page: Page): Promise<void>;
}

export async function installStatefulSyncRelay(page: Page): Promise<StatefulSyncRelay> {
  const relayBase = `${new URL(page.url()).origin}/sync-relay`;
  const relayPath = new URL(relayBase).pathname;
  const requests: string[] = [];
  const slots = new Map<RelaySlot, StoredSlot>();

  const attach = async (target: Page): Promise<void> => {
    await target.route(`${relayBase}/**`, (route) =>
      handleRoute(route, relayBase, relayPath, requests, slots),
    );
  };
  await attach(page);

  return {
    relayBase,
    requests,
    attach,
  };
}

async function handleRoute(
  route: Route,
  relayBase: string,
  relayPath: string,
  requests: string[],
  slots: Map<RelaySlot, StoredSlot>,
): Promise<void> {
  const request = route.request();
  const method = request.method();
  const { pathname } = new URL(request.url());
  requests.push(`${method} ${request.url()}`);

  if (method === 'POST' && pathname === `${relayPath}/channel`) {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ channelId: SYNC_CHANNEL_ID, writeToken: SYNC_WRITE_TOKEN }),
    });
    return;
  }

  const slotMatch = pathname.match(
    new RegExp(`^${escapeRegExp(relayPath)}/c/${SYNC_CHANNEL_ID}/(keybag|state)$`),
  );
  if (slotMatch) {
    const slot = slotMatch[1] as RelaySlot;
    if (method === 'GET') {
      const stored = slots.get(slot);
      if (!stored) {
        await route.fulfill({ status: 404, body: '' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        headers: { ETag: stored.generation },
        body: stored.bytes,
      });
      return;
    }

    if (method === 'PUT') {
      const current = slots.get(slot);
      const expected = current?.generation ?? '"0"';
      if (request.headers()['if-match'] !== expected) {
        await route.fulfill({ status: 412, body: '' });
        return;
      }
      const revision = (current?.revision ?? 0) + 1;
      const generation = generationFor(slot, revision);
      slots.set(slot, {
        bytes: request.postDataBuffer() ?? Buffer.alloc(0),
        generation,
        revision,
      });
      await route.fulfill({ status: 204, headers: { ETag: generation }, body: '' });
      return;
    }
  }

  if (method === 'DELETE' && pathname === `${relayPath}/c/${SYNC_CHANNEL_ID}`) {
    slots.clear();
    await route.fulfill({ status: 204, body: '' });
    return;
  }

  const message = `Unexpected sync relay request: ${method} ${request.url()} (${relayBase})`;
  await route.fulfill({ status: 500, contentType: 'text/plain', body: message });
  throw new Error(message);
}

function generationFor(slot: RelaySlot, revision: number): string {
  return `"${slot}-${revision}"`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
