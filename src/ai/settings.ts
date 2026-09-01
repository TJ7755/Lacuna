import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'lacuna.aiSettings';
const CHANGE_EVENT = 'lacuna:ai-settings';
let unsavedSettings: AiSettings | null = null;

export interface AiSettings {
  enabled: boolean;
  misconceptionFirstEnabled: boolean;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  misconceptionFirstEnabled: true,
};

let cachedSnapshotKey = '';
let cachedSnapshot = { ...DEFAULT_AI_SETTINGS };

function readPersistedAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      enabled:
        typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_AI_SETTINGS.enabled,
      misconceptionFirstEnabled:
        typeof parsed.misconceptionFirstEnabled === 'boolean'
          ? parsed.misconceptionFirstEnabled
          : DEFAULT_AI_SETTINGS.misconceptionFirstEnabled,
    };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function readAiSettings(): AiSettings {
  return unsavedSettings ? { ...unsavedSettings } : readPersistedAiSettings();
}

export function writeAiSettings(patch: Partial<AiSettings>): void {
  const next = { ...readAiSettings(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    unsavedSettings = null;
  } catch {
    unsavedSettings = next;
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
}

function getAiSettingsSnapshot(): AiSettings {
  const settings = readAiSettings();
  const key = `${settings.enabled}:${settings.misconceptionFirstEnabled}`;
  if (key !== cachedSnapshotKey) {
    cachedSnapshotKey = key;
    cachedSnapshot = settings;
  }
  return cachedSnapshot;
}

function subscribeToAiSettings(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (
      event.storageArea !== localStorage ||
      (event.key !== null && event.key !== STORAGE_KEY)
    ) {
      return;
    }
    unsavedSettings = null;
    onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useAiSettings(): [AiSettings, (patch: Partial<AiSettings>) => void] {
  const settings = useSyncExternalStore(
    subscribeToAiSettings,
    getAiSettingsSnapshot,
    () => DEFAULT_AI_SETTINGS,
  );

  return [settings, writeAiSettings];
}
