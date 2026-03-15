import { useSettingsStore } from '../../store/settings';
import type { LlmProvider } from '../../types';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string | null;
  baseUrl: string | null;
  model: string;
}

export class LlmNotConfiguredError extends Error {
  constructor(message = 'LLM is not configured.') {
    super(message);
    this.name = 'LlmNotConfiguredError';
  }
}

export class LlmApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'LlmApiError';
    this.status = status;
  }
}

const DEFAULT_BASE_URLS: Record<LlmProvider, string> = {
  gemini: 'https://generativelanguage.googleapis.com/openai/',
  openai: 'https://api.openai.com/',
  ollama: 'http://localhost:11434/',
};

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  gemini: 'gemini-2.0-flash-lite',
  openai: 'gpt-4o-mini',
  ollama: 'llama3',
};

function trimOrNull(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function resolveBaseUrl(config: LlmConfig): string {
  if (config.provider === 'ollama') {
    return withTrailingSlash(
      trimOrNull(config.baseUrl) ?? DEFAULT_BASE_URLS.ollama,
    );
  }

  if (config.provider === 'openai') {
    return withTrailingSlash(
      trimOrNull(config.baseUrl) ?? DEFAULT_BASE_URLS.openai,
    );
  }

  return withTrailingSlash(DEFAULT_BASE_URLS.gemini);
}

function buildHeaders(config: LlmConfig): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const key = trimOrNull(config.apiKey);
  if (config.provider === 'ollama') {
    if (key) {
      headers.Authorization = `Bearer ${key}`;
    }
    return headers;
  }

  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  return headers;
}

async function readErrorMessage(response: Response): Promise<string> {
  const bodyText = await response.text();
  if (!bodyText) {
    return `Request failed with status ${response.status}.`;
  }

  try {
    const data = JSON.parse(bodyText) as {
      error?: { message?: string };
      message?: string;
    };
    return data.error?.message ?? data.message ?? bodyText;
  } catch {
    return bodyText;
  }
}

function getEndpoint(config: LlmConfig): string {
  return `${resolveBaseUrl(config)}v1/chat/completions`;
}

export async function complete(
  messages: LlmMessage[],
  config: LlmConfig,
  options?: { maxTokens?: number },
): Promise<string> {
  const response = await fetch(getEndpoint(config), {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: options?.maxTokens,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new LlmApiError(response.status, await readErrorMessage(response));
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content ?? '';
}

export async function completeStream(
  messages: LlmMessage[],
  config: LlmConfig,
  options?: { maxTokens?: number; onChunk: (chunk: string) => void },
): Promise<string> {
  const response = await fetch(getEndpoint(config), {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: options?.maxTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new LlmApiError(response.status, await readErrorMessage(response));
  }

  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let done = false;
  let pending = '';
  let output = '';

  while (!done) {
    const result = await reader.read();
    done = result.done;
    pending += decoder.decode(result.value, { stream: true });

    const lines = pending.split('\n');
    pending = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) {
        continue;
      }

      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') {
        continue;
      }

      try {
        const data = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const chunk = data.choices?.[0]?.delta?.content ?? '';
        if (chunk) {
          output += chunk;
          options?.onChunk(chunk);
        }
      } catch {
        // Ignore malformed stream chunks and continue reading.
      }
    }
  }

  return output;
}

export function getLlmConfig(): LlmConfig {
  const state = useSettingsStore.getState();
  const provider = state.llmProvider;

  if (!provider) {
    throw new LlmNotConfiguredError();
  }

  const apiKey = trimOrNull(state.llmApiKey);
  const baseUrl = trimOrNull(state.llmBaseUrl);
  const model = trimOrNull(state.llmModel) ?? DEFAULT_MODELS[provider];

  if (provider !== 'ollama' && !apiKey) {
    throw new LlmNotConfiguredError();
  }

  return {
    provider,
    apiKey,
    baseUrl,
    model,
  };
}
