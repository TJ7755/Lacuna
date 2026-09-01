import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

function stringLiterals(source: string, pattern: RegExp, label: string): string[] {
  const match = source.match(pattern);
  if (!match?.[1]) throw new Error(`Could not read ${label}`);
  return Array.from(match[1].matchAll(/'([^']+)'/g), (literal) => literal[1]);
}

describe('desktop updater contract', () => {
  it('keeps the CommonJS preload validator aligned with the shared type-only contract', () => {
    const contract = readFileSync(resolve(root, 'electron/updaterContract.d.ts'), 'utf8');
    const preload = readFileSync(resolve(root, 'electron/preload.ts'), 'utf8');

    const phases = stringLiterals(
      contract,
      /export type UpdatePhase =([\s\S]*?);/,
      'UpdatePhase',
    );
    const validatedPhases = stringLiterals(
      preload,
      /const UPDATE_PHASES = new Set<UpdatePhase>\(\[([\s\S]*?)\]\);/,
      'UPDATE_PHASES',
    );
    const manualReasons = stringLiterals(
      contract,
      /export type ManualUpdateReason =([\s\S]*?);/,
      'ManualUpdateReason',
    );
    const validatedManualReasons = stringLiterals(
      preload,
      /const MANUAL_REASONS = new Set<ManualUpdateReason>\(\[([\s\S]*?)\]\);/,
      'MANUAL_REASONS',
    );

    expect(validatedPhases).toEqual(phases);
    expect(validatedManualReasons).toEqual(manualReasons);
  });
});
