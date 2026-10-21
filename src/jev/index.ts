/** Stable boundary consumed by the study and settings UI. */
import { useSyncExternalStore } from 'react';
import { jevEngine } from './engine';
export * from './types';
export * from './protocol';
export { createJevEngine, JEV_SETTINGS_STORAGE_KEY } from './engine';
export function useJevSettings() { return useSyncExternalStore(jevEngine.subscribe, jevEngine.settings); }
export function useJevStatus() { return useSyncExternalStore(jevEngine.subscribe, jevEngine.status); }
export function useJevController() { return jevEngine; }
export function useJevTypedMarker() {
  useJevSettings();
  useJevStatus();
  return jevEngine.marker();
}
export function useJevAttemptMarking(_attemptId: string): import('./types').JevAttemptMarking { return { state: 'idle' }; }
