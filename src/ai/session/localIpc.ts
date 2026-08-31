import type { LocalAiRequestSource } from './local';

export type LocalAiPreloadApi = NonNullable<NonNullable<Window['electronAPI']>['ai']>;

export function createElectronLocalAiRequestSource(
  providedApi?: LocalAiPreloadApi,
): LocalAiRequestSource {
  const api = providedApi ?? electronAiApi();
  return {
    disconnect(channelId) {
      api?.disconnect(channelId);
    },
    listen(handler, onDisconnected) {
      if (!api) return () => undefined;
      return api.listen(handler, onDisconnected);
    },
  };
}

function electronAiApi(): LocalAiPreloadApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.electronAPI?.ai;
}
