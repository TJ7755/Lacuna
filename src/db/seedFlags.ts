// The welcome-course seed's progress flags, kept apart from src/db/seed.ts so that start-up
// can tell whether seeding work remains without loading the course content or the database.

export const SEED_FLAG_KEY = 'lacuna-seeded';
export const SEED_ASSET_REPAIR_FLAG_KEY = 'lacuna-seed-assets-v3';

/** True until the welcome course is seeded and its one-off asset repair has run. */
export function seedWorkPending(): boolean {
  try {
    return !localStorage.getItem(SEED_FLAG_KEY) || !localStorage.getItem(SEED_ASSET_REPAIR_FLAG_KEY);
  } catch {
    return true;
  }
}
