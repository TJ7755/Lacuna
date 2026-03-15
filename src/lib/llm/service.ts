import { complete, completeStream, getLlmConfig } from './client';
import {
  buildAlternativePhrasingsPrompt,
  buildCardGenerationPrompt,
  buildExplanationPrompt,
  buildPracticeTestPrompt,
  buildSummarisationPrompt,
} from './prompts';

export type PracticeTest = {
  questions: Array<{
    question: string;
    options?: string[];
    answer: string;
  }>;
};

function stripMarkdownCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function parseJson<T>(raw: string): T {
  return JSON.parse(stripMarkdownCodeFences(raw)) as T;
}

function decodePartialJsonString(fragment: string): string {
  let value = fragment;
  if (value.endsWith('\\')) {
    value = value.slice(0, -1);
  }

  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function extractExplanationPreview(raw: string): string {
  const keyIndex = raw.indexOf('"explanation"');
  if (keyIndex < 0) {
    return '';
  }

  const colonIndex = raw.indexOf(':', keyIndex);
  if (colonIndex < 0) {
    return '';
  }

  const quoteStart = raw.indexOf('"', colonIndex);
  if (quoteStart < 0) {
    return '';
  }

  let escaped = false;
  let i = quoteStart + 1;
  let content = '';

  while (i < raw.length) {
    const ch = raw[i];
    if (escaped) {
      content += ch;
      escaped = false;
      i += 1;
      continue;
    }

    if (ch === '\\') {
      content += ch;
      escaped = true;
      i += 1;
      continue;
    }

    if (ch === '"') {
      break;
    }

    content += ch;
    i += 1;
  }

  return decodePartialJsonString(content);
}

export async function generateCards(params: {
  text: string;
  deckName: string;
  count: number;
  cardType: 'basic' | 'cloze';
}): Promise<Array<{ front?: string; back?: string; clozeText?: string }>> {
  const config = getLlmConfig();
  const prompt = buildCardGenerationPrompt(params);
  const raw = await complete(prompt, config);

  if (params.cardType === 'cloze') {
    const items = parseJson<Array<{ clozeText?: string }>>(raw);
    return items
      .map((item) => ({ clozeText: item.clozeText?.trim() }))
      .filter((item) => !!item.clozeText);
  }

  const items = parseJson<Array<{ front?: string; back?: string }>>(raw);
  return items
    .map((item) => ({
      front: item.front?.trim(),
      back: item.back?.trim(),
    }))
    .filter((item) => !!item.front && !!item.back);
}

export async function generatePracticeTest(params: {
  text: string;
  subject: string;
  questionCount: number;
  format: 'multiple_choice' | 'short_answer';
}): Promise<PracticeTest> {
  const config = getLlmConfig();
  const prompt = buildPracticeTestPrompt(params);
  const raw = await complete(prompt, config);
  return parseJson<PracticeTest>(raw);
}

export async function explainAnswer(params: {
  front: string;
  back: string;
  noteContext?: string;
  onChunk: (chunk: string) => void;
}): Promise<string> {
  const config = getLlmConfig();
  const prompt = buildExplanationPrompt(params);

  let streamedRaw = '';
  let emitted = '';

  const raw = await completeStream(prompt, config, {
    onChunk: (chunk) => {
      streamedRaw += chunk;
      const preview = extractExplanationPreview(streamedRaw);
      if (!preview || preview.length <= emitted.length) {
        return;
      }

      const delta = preview.slice(emitted.length);
      emitted = preview;
      params.onChunk(delta);
    },
  });

  const parsed = parseJson<{ explanation?: string }>(raw);
  const explanation = parsed.explanation?.trim() ?? '';

  if (explanation.length > emitted.length) {
    params.onChunk(explanation.slice(emitted.length));
  }

  return explanation;
}

export async function suggestAlternativePhrasings(params: {
  front: string;
  back: string;
}): Promise<Array<{ front: string; back: string }>> {
  const config = getLlmConfig();
  const prompt = buildAlternativePhrasingsPrompt(params);
  const raw = await complete(prompt, config);
  const parsed = parseJson<{
    phrasings?: Array<{ front?: string; back?: string }>;
  }>(raw);

  return (parsed.phrasings ?? [])
    .map((item) => ({
      front: item.front?.trim() ?? '',
      back: item.back?.trim() ?? '',
    }))
    .filter((item) => item.front.length > 0 && item.back.length > 0);
}

export async function summariseNote(params: {
  text: string;
  targetLength: 'brief' | 'detailed';
}): Promise<string> {
  const config = getLlmConfig();
  const prompt = buildSummarisationPrompt(params);
  const raw = await complete(prompt, config);
  const parsed = parseJson<{ summary?: string }>(raw);
  return parsed.summary?.trim() ?? '';
}

export { LlmNotConfiguredError, LlmApiError } from './client';
