import { createLocalSetting } from './localSetting';

// The global default for FSRS scheduling optimisation. On by default: fitting the
// weights to a user's own review history is where most of FSRS's efficiency comes
// from. A deck can override this to off (see Deck.autoOptimise); applying optimised
// weights always still requires explicit confirmation.

const setting = createLocalSetting<boolean>({
  key: 'lacuna.autoOptimise',
  event: 'lacuna:auto-optimise',
  // Default on: only an explicit 'off' opts out.
  parse: (raw) => raw !== 'off',
  serialise: (enabled) => (enabled ? 'on' : 'off'),
});

export const readAutoOptimiseDefault = setting.read;
export const writeAutoOptimiseDefault = setting.write;
export const useAutoOptimiseDefault = setting.use;

/** Whether optimisation is enabled for a deck: the deck override wins, else the global default. */
export function optimiseEnabledForDeck(
  deckOverride: boolean | undefined,
  globalDefault: boolean,
): boolean {
  return deckOverride ?? globalDefault;
}
