import type { BackupAsset, Card, Note, Occlusion } from '@lacuna/core/db/types';
import type { QuestionAttempt, QuestionDefinition } from '@lacuna/core/questions/types';
import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';
import type { QuestionSetAttemptRecord } from '@lacuna/core/questions/questionSetAttempts';
import { canonicalJson } from './snapshotRecords';

const ASSET_RE = /lacuna-asset:\/\/([a-f0-9]{64})/gi;

export function mergeAssets(
  left: BackupAsset[],
  right: BackupAsset[],
  cards: Card[],
  notes: Note[],
  occlusions: Occlusion[],
  questions: QuestionDefinition[],
  attempts: QuestionAttempt[],
  questionSets: QuestionSetRecord[],
  questionSetAttempts: QuestionSetAttemptRecord[],
): BackupAsset[] {
  const byHash = new Map<string, BackupAsset>();
  for (const asset of [...left, ...right]) {
    const hash = asset.hash.toLowerCase();
    const normalised = { ...asset, hash };
    const existing = byHash.get(hash);
    if (!existing || canonicalJson(normalised) > canonicalJson(existing)) {
      byHash.set(hash, normalised);
    }
  }
  const referenced = referencedHashes(
    cards,
    notes,
    occlusions,
    questions,
    attempts,
    questionSets,
    questionSetAttempts,
  );
  return [...byHash.values()]
    .filter((asset) => referenced.has(asset.hash))
    .sort((a, b) => a.hash.localeCompare(b.hash));
}

function referencedHashes(
  cards: Card[],
  notes: Note[],
  occlusions: Occlusion[],
  questions: QuestionDefinition[],
  attempts: QuestionAttempt[],
  questionSets: QuestionSetRecord[],
  questionSetAttempts: QuestionSetAttemptRecord[],
): Set<string> {
  const hashes = new Set<string>();
  const scan = (markdown: string) => {
    ASSET_RE.lastIndex = 0;
    for (const match of markdown.matchAll(ASSET_RE)) hashes.add(match[1].toLowerCase());
  };
  for (const card of cards) scan(`${card.front}\n${card.back}`);
  for (const note of notes) scan(note.content);
  for (const occlusion of occlusions) hashes.add(occlusion.assetHash.toLowerCase());
  const scanValue = (value: unknown): void => {
    if (typeof value === 'string') {
      scan(value);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) value.forEach(scanValue);
    else Object.values(value as Record<string, unknown>).forEach(scanValue);
  };
  questions.forEach(scanValue);
  attempts.forEach(scanValue);
  questionSets.forEach(scanValue);
  questionSetAttempts.forEach(scanValue);
  return hashes;
}
