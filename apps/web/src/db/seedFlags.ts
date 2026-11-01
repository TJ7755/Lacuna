// First-run progress flags, kept apart from src/db/seed.ts so that start-up can tell whether
// first-run work remains without loading the repair artwork or the database. The key names
// date from the retired Welcome course seed and stay unchanged for existing installs.

export const SEED_FLAG_KEY = 'lacuna-seeded';
export const SEED_ASSET_REPAIR_FLAG_KEY = 'lacuna-seed-assets-v3';

/** True until first-run checks and the one-off Welcome course asset repair have run. */
export function seedWorkPending(): boolean {
  try {
    return (
      !localStorage.getItem(SEED_FLAG_KEY) || !localStorage.getItem(SEED_ASSET_REPAIR_FLAG_KEY)
    );
  } catch {
    return true;
  }
}
