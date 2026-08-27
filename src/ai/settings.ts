import { useEffect, useState } from 'react';

const STORAGE_KEY = 'lacuna.aiSettings';
const CHANGE_EVENT = 'lacuna:ai-settings';

export interface AiSettings {
  enabled: boolean;
  misconceptionFirstEnabled: boolean;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  misconceptionFirstEnabled: true,
};

export function readAiSettings(): AiSettings {
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

export function writeAiSettings(patch: Partial<AiSettings>): void {
  const next = { ...readAiSettings(), ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
}

export function useAiSettings(): [AiSettings, (patch: Partial<AiSettings>) => void] {
  const [settings, setSettings] = useState(readAiSettings);

  useEffect(() => {
    const onChange = () => setSettings(readAiSettings());
    window.addEventListener('storage', onChange);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, []);

  return [
    settings,
    (patch) => {
      writeAiSettings(patch);
      setSettings(readAiSettings());
    },
  ];
}
