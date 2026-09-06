import { expect, test, type Browser, type Page } from '@playwright/test';
import type { Card, Grade } from '../../src/db/types';
import type { ReviewHistoryEntry } from '../../src/db/reviewHistory';
import { applyReview, makeEngine } from '../../src/fsrs/fsrs';
import { defaultFsrsParameters } from '../../src/fsrs/params';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';
import {
  addCard,
  addLessonCard,
  deleteOnlyCard,
  editOnlyCard,
  exposeOnlyCard,
  readAll,
  reviewOnlyCard,
  suppressStudyEndSync,
  syncNow,
} from './fixtures/syncConvergence';
import {
  installStatefulSyncRelay,
  SYNC_CHANNEL_ID,
  SYNC_PASSPHRASE,
  type StatefulSyncRelay,
} from './fixtures/syncRelay';

interface TombstoneRow {
  table: string;
  recordId: string;
  deletedAt: number;
}

async function preparePeers(
  browser: Browser,
  page: Page,
  initialFront?: string,
  exposeBeforePairing = false,
) {
  test.setTimeout(120_000);
  await enterFreshLacuna(page);
  await createCourse(page, 'Concurrent revision');
  const courseId = /#\/course\/([^/]+)/.exec(page.url())![1];
  if (initialFront) {
    await addLessonCard(page, courseId, initialFront);
    if (exposeBeforePairing) {
      await exposeOnlyCard(page, courseId);
      // A fresh document cancels the unpaired study-end timer while retaining
      // the lesson exposure in IndexedDB for both paired devices.
      await page.reload();
    }
  }

  const relay = await installStatefulSyncRelay(page);
  await page.goto('/#/settings');
  await page.locator('#settings-sync').getByRole('button', { name: 'Set up sync' }).click();
  await page.getByLabel('Relay URL', { exact: true }).fill(relay.relayBase);
  await page
    .getByLabel('Relay mint secret (private relays only)', { exact: true })
    .fill('test-mint-secret');
  await page.getByLabel('Recovery passphrase', { exact: true }).fill(SYNC_PASSPHRASE);
  await page.getByLabel('Confirm recovery passphrase', { exact: true }).fill(SYNC_PASSPHRASE);
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().endsWith('/state') && response.request().method() === 'PUT',
    ),
    page.getByRole('button', { name: 'Set up sync', exact: true }).click(),
  ]);
  await page.goto('/#/settings');
  await expect(page.getByText('Paired to a sync channel')).toBeVisible({ timeout: 30_000 });

  const peerContext = await browser.newContext();
  const peer = await peerContext.newPage();
  await relay.attach(peer);
  await enterFreshLacuna(peer);
  await peer.goto('/#/settings');
  await peer.locator('#settings-sync').getByRole('button', { name: 'Join another device' }).click();
  await peer.getByRole('tab', { name: 'Enter details' }).click();
  await peer.getByLabel('Relay URL', { exact: true }).fill(relay.relayBase);
  await peer.getByLabel('Channel id', { exact: true }).fill(SYNC_CHANNEL_ID);
  await peer.getByLabel('Recovery passphrase', { exact: true }).fill(SYNC_PASSPHRASE);
  await Promise.all([
    peer.waitForResponse(
      (response) => response.url().endsWith('/state') && response.request().method() === 'GET',
    ),
    peer.getByRole('button', { name: 'Join channel' }).click(),
  ]);
  await peer.goto('/#/settings');
  await expect(peer.getByText('Paired to a sync channel')).toBeVisible({ timeout: 30_000 });

  return { courseId, peer, peerContext, relay };
}

async function collideAndConverge(page: Page, peer: Page, relay: StatefulSyncRelay) {
  let collisions = 0;
  for (const device of [page, peer]) {
    device.on('response', (response) => {
      if (response.url().endsWith('/state') && response.status() === 412) collisions += 1;
    });
  }
  relay.collideNextStateWrites();
  await Promise.all([syncNow(page), syncNow(peer)]);
  await expect.poll(() => collisions, { timeout: 30_000 }).toBeGreaterThan(0);
  // The winning writer pulls again to receive the loser's merged successor.
  await syncNow(page);
  await syncNow(peer);
}

test('two browser profiles preserve both additions after colliding relay writes', async ({
  browser,
  page,
}) => {
  const { courseId, peer, peerContext, relay } = await preparePeers(browser, page);
  try {
    await Promise.all([
      addCard(page, courseId, 'Device A addition'),
      addCard(peer, courseId, 'Device B addition'),
    ]);
    await collideAndConverge(page, peer, relay);

    for (const device of [page, peer]) {
      await device.goto(`/#/course/${courseId}/cards`);
      await device.reload();
      await expect(device.getByText('Device A addition', { exact: true })).toBeVisible();
      await expect(device.getByText('Device B addition', { exact: true })).toBeVisible();
    }
  } finally {
    relay.releaseStateWriteBarrier();
    await peer.unrouteAll({ behavior: 'ignoreErrors' });
    await peerContext.close();
  }
});

test('two browser profiles converge simultaneous edits to the same card', async ({
  browser,
  page,
}) => {
  const { courseId, peer, peerContext, relay } = await preparePeers(browser, page, 'Shared card');
  try {
    await Promise.all([
      editOnlyCard(page, courseId, 'Device A edit'),
      editOnlyCard(peer, courseId, 'Device B edit'),
    ]);
    const localEdit = (await readAll<Card>(page, 'cards')).find(
      (card) => card.courseId === courseId,
    )!;
    const peerEdit = (await readAll<Card>(peer, 'cards')).find(
      (card) => card.courseId === courseId,
    )!;
    const expectedFront =
      localEdit.updatedAt === peerEdit.updatedAt
        ? [localEdit.front, peerEdit.front].sort().at(-1)
        : localEdit.updatedAt > peerEdit.updatedAt
          ? localEdit.front
          : peerEdit.front;
    await collideAndConverge(page, peer, relay);
    await Promise.all([page.reload(), peer.reload()]);

    const [allPageCards, allPeerCards] = await Promise.all([
      readAll<Card>(page, 'cards'),
      readAll<Card>(peer, 'cards'),
    ]);
    const pageCards = allPageCards.filter((card) => card.courseId === courseId);
    const peerCards = allPeerCards.filter((card) => card.courseId === courseId);
    expect(pageCards).toHaveLength(1);
    expect(peerCards).toEqual(pageCards);
    expect(pageCards[0].front).toBe(expectedFront);
  } finally {
    relay.releaseStateWriteBarrier();
    await peer.unrouteAll({ behavior: 'ignoreErrors' });
    await peerContext.close();
  }
});

test('a newer deletion wins over an unsynchronised edit to the same card', async ({
  browser,
  page,
}) => {
  const { courseId, peer, peerContext, relay } = await preparePeers(browser, page, 'Shared card');
  try {
    await editOnlyCard(peer, courseId, 'Peer edit before deletion');
    const peerEdit = (await readAll<Card>(peer, 'cards')).find(
      (card) => card.courseId === courseId,
    )!;
    await expect.poll(() => page.evaluate(() => Date.now())).toBeGreaterThan(peerEdit.updatedAt);
    await deleteOnlyCard(page, courseId);
    const deletion = (await readAll<TombstoneRow>(page, 'tombstones')).find(
      (row) => row.table === 'cards' && row.recordId === peerEdit.id,
    )!;
    expect(deletion.deletedAt).toBeGreaterThan(peerEdit.updatedAt);
    await collideAndConverge(page, peer, relay);
    await Promise.all([page.reload(), peer.reload()]);

    for (const device of [page, peer]) {
      expect(
        (await readAll<Card>(device, 'cards')).filter((card) => card.courseId === courseId),
      ).toEqual([]);
      await device.goto(`/#/course/${courseId}/cards`);
      await expect(
        device.getByText('This course has no cards yet.', { exact: true }),
      ).toBeVisible();
    }
  } finally {
    relay.releaseStateWriteBarrier();
    await peer.unrouteAll({ behavior: 'ignoreErrors' });
    await peerContext.close();
  }
});

test('two browser profiles preserve concurrent reviews of the same card', async ({
  browser,
  page,
}) => {
  const { courseId, peer, peerContext, relay } = await preparePeers(
    browser,
    page,
    'Reviewed twice',
    true,
  );
  try {
    const initialCard = (await readAll<Card>(page, 'cards')).find(
      (card) => card.courseId === courseId,
    )!;
    const stateWritesBeforeReviews = relay.requests.filter(
      (request) => request.startsWith('PUT ') && request.endsWith('/state'),
    ).length;
    await Promise.all([suppressStudyEndSync(page), suppressStudyEndSync(peer)]);
    const [localStudyCardId, peerStudyCardId] = await Promise.all([
      reviewOnlyCard(page, courseId),
      reviewOnlyCard(peer, courseId),
    ]);
    expect(localStudyCardId).toBe(initialCard.id);
    expect(peerStudyCardId).toBe(initialCard.id);
    const stateWritesBeforeCollision = relay.requests.filter(
      (request) => request.startsWith('PUT ') && request.endsWith('/state'),
    ).length;
    expect(stateWritesBeforeCollision).toBe(stateWritesBeforeReviews);
    const localAllReviews = await readAll<ReviewHistoryEntry>(page, 'reviewHistory');
    const peerAllReviews = await readAll<ReviewHistoryEntry>(peer, 'reviewHistory');
    expect(localAllReviews).toEqual([expect.objectContaining({ cardId: initialCard.id })]);
    expect(peerAllReviews).toEqual([expect.objectContaining({ cardId: initialCard.id })]);
    const localReviews = localAllReviews.filter((review) => review.cardId === initialCard.id);
    const peerReviewsBeforeSync = peerAllReviews.filter(
      (review) => review.cardId === initialCard.id,
    );
    expect(localReviews).toHaveLength(1);
    expect(peerReviewsBeforeSync).toHaveLength(1);
    const reviewsBeforeSync = [...localReviews, ...peerReviewsBeforeSync];
    const expectedEventIds = reviewsBeforeSync.map((review) => review.eventId).sort();
    const expected = replayReviews(initialCard, reviewsBeforeSync);
    await collideAndConverge(page, peer, relay);
    await Promise.all([page.reload(), peer.reload()]);

    const [allPageCards, allPeerCards, allPageReviews, allPeerReviews] = await Promise.all([
      readAll<Card>(page, 'cards'),
      readAll<Card>(peer, 'cards'),
      readAll<ReviewHistoryEntry>(page, 'reviewHistory'),
      readAll<ReviewHistoryEntry>(peer, 'reviewHistory'),
    ]);
    const pageCards = allPageCards.filter((card) => card.courseId === courseId);
    const peerCards = allPeerCards.filter((card) => card.courseId === courseId);
    const pageReviews = allPageReviews;
    const peerReviews = allPeerReviews;
    expect(pageCards).toHaveLength(1);
    expect(peerCards).toEqual(pageCards);
    expect(pageReviews).toHaveLength(2);
    expect(peerReviews).toEqual(pageReviews);
    expect(new Set(pageReviews.map((review) => review.eventId)).size).toBe(2);
    expect(pageReviews.map((review) => review.eventId).sort()).toEqual(expectedEventIds);
    expect(pageReviews.every((review) => review.cardId === pageCards[0].id)).toBe(true);
    expect(pageCards[0].reps).toBe(2);
    expect(schedulingProjection(pageCards[0])).toEqual(schedulingProjection(expected));
  } finally {
    relay.releaseStateWriteBarrier();
    await peer.unrouteAll({ behavior: 'ignoreErrors' });
    await peerContext.close();
  }
});

function replayReviews(card: Card, reviews: ReviewHistoryEntry[]): Card {
  let replayed: Card = {
    ...card,
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    history: [],
  };
  const engine = makeEngine({ ...defaultFsrsParameters(), enable_fuzz: false });
  for (const review of [...reviews].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return (a.eventId ?? a.id).localeCompare(b.eventId ?? b.id);
  })) {
    replayed = {
      ...replayed,
      ...applyReview(engine, replayed, review.grade as Grade, review.timestamp).memory,
    };
  }
  return replayed;
}

function schedulingProjection(card: Card) {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    state: card.state,
    lastReviewed: card.lastReviewed,
    reps: card.reps,
    lapses: card.lapses,
    scheduledDays: card.scheduledDays,
    learningSteps: card.learningSteps,
  };
}
