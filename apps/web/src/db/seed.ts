import { storedString } from '../state/localSetting';
// First-run bookkeeping. New installs start empty; onboarding (#816) replaces the old
// Welcome to Lacuna course. Learners who already have that course keep it, so the one-off
// repair of its stored drawings stays here.

import { db } from './schema';
import { assetUrl, sha256Blob } from './assets';
import {
  SEED_ASSET_REPAIR_FLAG_KEY as ASSET_REPAIR_FLAG_KEY,
  SEED_FLAG_KEY as FLAG_KEY,
} from './seedFlags';

let settling = false;

/** Build an image MediaAsset record from an inline SVG string without writing to the database yet. */
async function prepareSvgAsset(svg: string, width: number, height: number) {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const hash = await sha256Blob(blob);
  return {
    record: {
      hash,
      blob: new TextEncoder().encode(svg),
      mimeType: 'image/svg+xml' as const,
      width,
      height,
      createdAt: Date.now(),
    },
    url: assetUrl(hash),
  };
}

const LEGACY_FORGETTING_CURVE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160">
  <line x1="30" y1="130" x2="300" y2="130" stroke="currentColor" stroke-width="1" opacity="0.3"/>
  <line x1="30" y1="130" x2="30" y2="20" stroke="currentColor" stroke-width="1" opacity="0.3"/>
  <text x="16" y="25" font-size="10" fill="currentColor" opacity="0.6">R</text>
  <text x="16" y="135" font-size="10" fill="currentColor" opacity="0.6">t</text>
  <path d="M 30 30 Q 120 45 200 85 T 300 125" fill="none" stroke="currentColor" stroke-width="2" opacity="0.8"/>
  <line x1="30" y1="45" x2="300" y2="45" stroke="currentColor" stroke-width="1" stroke-dasharray="3,3" opacity="0.4"/>
  <text x="305" y="40" font-size="9" fill="currentColor" opacity="0.6">0.90</text>
</svg>`;

const LEGACY_SAMPLE_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120">
  <rect x="10" y="20" width="180" height="80" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <circle cx="60" cy="55" r="14" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <polyline points="90,90 115,60 140,80 175,40" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
</svg>`;

const FORGETTING_CURVE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160">
  <rect width="320" height="160" rx="10" fill="#1c1917"/>
  <line x1="30" y1="130" x2="300" y2="130" stroke="#a8a29e" stroke-width="1" opacity="0.7"/>
  <line x1="30" y1="130" x2="30" y2="20" stroke="#a8a29e" stroke-width="1" opacity="0.7"/>
  <text x="16" y="25" font-size="10" fill="#e7e5e4">R</text>
  <text x="16" y="135" font-size="10" fill="#e7e5e4">t</text>
  <path d="M 30 30 Q 120 45 200 85 T 300 125" fill="none" stroke="#fb923c" stroke-width="2.5"/>
  <line x1="30" y1="45" x2="300" y2="45" stroke="#d6d3d1" stroke-width="1" stroke-dasharray="3,3" opacity="0.65"/>
  <text x="305" y="40" font-size="9" fill="#e7e5e4">0.90</text>
</svg>`;

const SAMPLE_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120">
  <rect width="200" height="120" rx="10" fill="#1c1917"/>
  <rect x="10" y="20" width="180" height="80" rx="6" fill="none" stroke="#a8a29e" stroke-width="1.5"/>
  <circle cx="60" cy="55" r="14" fill="none" stroke="#d6d3d1" stroke-width="1.5"/>
  <polyline points="90,90 115,60 140,80 175,40" fill="none" stroke="#fb923c" stroke-width="2"/>
</svg>`;

async function repairSeededSvgAssets(): Promise<void> {
  try {
    if (storedString(ASSET_REPAIR_FLAG_KEY).read()) return;
  } catch {
    // localStorage may be unavailable; the idempotent database check still works.
  }

  const repairInputs: ReadonlyArray<readonly [string, string, number, number]> = [
    [LEGACY_FORGETTING_CURVE_SVG, FORGETTING_CURVE_SVG, 320, 160],
    [LEGACY_SAMPLE_IMAGE_SVG, SAMPLE_IMAGE_SVG, 200, 120],
  ];
  const repairs = await Promise.all(
    repairInputs.map(async ([legacySvg, currentSvg, width, height]) => ({
      legacy: await prepareSvgAsset(legacySvg, width, height),
      current: await prepareSvgAsset(currentSvg, width, height),
    })),
  );

  for (const { legacy, current } of repairs) {
    const cards = await db.cards
      .filter(
        (card) =>
          card.front.includes(legacy.url) ||
          card.back.includes(legacy.url) ||
          card.front.includes(current.url) ||
          card.back.includes(current.url),
      )
      .toArray();
    if (cards.length === 0) continue;

    await db.transaction('rw', db.assets, db.cards, async () => {
      const stored = await db.assets.get(current.record.hash);
      if (!stored || !(stored.blob instanceof Uint8Array)) await db.assets.put(current.record);

      const migrated = cards
        .filter((card) => card.front.includes(legacy.url) || card.back.includes(legacy.url))
        .map((card) => ({
          ...card,
          front: card.front.replaceAll(legacy.url, current.url),
          back: card.back.replaceAll(legacy.url, current.url),
        }));
      if (migrated.length > 0) await db.cards.bulkPut(migrated);
    });
  }

  try {
    storedString(ASSET_REPAIR_FLAG_KEY).write('1');
  } catch {
    // localStorage may be unavailable; the next start will repeat the safe repair.
  }
}

/**
 * True only on a genuinely fresh browser: first-run bookkeeping has never completed and the
 * database has no courses.
 */
export async function isFirstRun(): Promise<boolean> {
  try {
    if (storedString(FLAG_KEY).read()) return false;
  } catch {
    // localStorage may be unavailable; fall through to the database check.
  }
  return (await db.courses.count()) === 0;
}

/** Record that first-run checks are done, repairing any existing Welcome course's drawings. */
export async function settleFirstRun(): Promise<void> {
  if (settling) return;
  settling = true;
  try {
    if ((await db.courses.count()) > 0) await repairSeededSvgAssets();
    // Best-effort flags so future starts skip this work.
    try {
      storedString(FLAG_KEY).write('1');
      storedString(ASSET_REPAIR_FLAG_KEY).write('1');
    } catch {
      // localStorage may be unavailable; the next start repeats the safe checks.
    }
  } finally {
    settling = false;
  }
}
