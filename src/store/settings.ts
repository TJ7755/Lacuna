import { create } from 'zustand';
import type { LlmProvider, Theme } from '../types';
import { getAllSettings, setSetting } from '../db/repositories/settings';
import { SETTINGS_KEYS } from '../lib/settingsKeys';

interface SaveLlmConfigParams {
  provider: LlmProvider;
  apiKey: string | null;
  baseUrl: string | null;
  model: string;
}

interface SettingsState {
  llmProvider: LlmProvider | null;
  llmApiKey: string | null;
  llmBaseUrl: string | null;
  llmModel: string | null;
  theme: Theme;
  loaded: boolean;

  loadSettings: () => Promise<void>;
  saveLlmConfig: (config: SaveLlmConfigParams) => Promise<void>;
  saveTheme: (theme: Theme) => Promise<void>;
}

function parseStored<T>(raw: string | undefined): T | null {
  if (raw === undefined) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseTheme(theme: string | undefined): Theme {
  const parsed = parseStored<string>(theme);
  if (parsed === 'light' || parsed === 'dark' || parsed === 'system') {
    return parsed;
  }
  return 'system';
}

function parseProvider(provider: string | undefined): LlmProvider | null {
  const parsed = parseStored<string>(provider);
  if (parsed === 'gemini' || parsed === 'openai' || parsed === 'ollama') {
    return parsed;
  }
  return null;
}

function normaliseNullable(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  llmProvider: null,
  llmApiKey: null,
  llmBaseUrl: null,
  llmModel: null,
  theme: 'system',
  loaded: false,

  loadSettings: async () => {
    const all = await getAllSettings();

    set({
      llmProvider: parseProvider(all[SETTINGS_KEYS.LLM_PROVIDER]),
      llmApiKey: normaliseNullable(
        parseStored<string | null>(all[SETTINGS_KEYS.LLM_API_KEY]),
      ),
      llmBaseUrl: normaliseNullable(
        parseStored<string | null>(all[SETTINGS_KEYS.LLM_BASE_URL]),
      ),
      llmModel: normaliseNullable(
        parseStored<string | null>(all[SETTINGS_KEYS.LLM_MODEL]),
      ),
      theme: parseTheme(all[SETTINGS_KEYS.THEME]),
      loaded: true,
    });
  },

  saveLlmConfig: async (config) => {
    const apiKey = normaliseNullable(config.apiKey);
    const baseUrl = normaliseNullable(config.baseUrl);
    const model = config.model.trim();

    await Promise.all([
      setSetting(SETTINGS_KEYS.LLM_PROVIDER, JSON.stringify(config.provider)),
      setSetting(SETTINGS_KEYS.LLM_API_KEY, JSON.stringify(apiKey)),
      setSetting(SETTINGS_KEYS.LLM_BASE_URL, JSON.stringify(baseUrl)),
      setSetting(SETTINGS_KEYS.LLM_MODEL, JSON.stringify(model)),
    ]);

    set({
      llmProvider: config.provider,
      llmApiKey: apiKey,
      llmBaseUrl: baseUrl,
      llmModel: model,
    });
  },

  saveTheme: async (theme) => {
    await setSetting(SETTINGS_KEYS.THEME, JSON.stringify(theme));
    set({ theme });
  },
}));
