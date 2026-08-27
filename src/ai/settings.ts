import { useEffect, useState } from 'react';

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

export function useAiSettings(): [AiSettings, (patch: Partial<AiSettings>) => void] {
  const [settings, setSettings] = useState(readAiSettings);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (
        event.storageArea !== localStorage ||
        (event.key !== null && event.key !== STORAGE_KEY)
      ) {
        return;
      }
      unsavedSettings = null;
      setSettings(readPersistedAiSettings());
    };
    const onChange = (event: Event) => {
      setSettings((event as CustomEvent<AiSettings>).detail);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, []);

  return [
    settings,
    (patch) => {
      writeAiSettings(patch);
    },
  ];
}
