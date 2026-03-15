import type { LlmMessage } from './client';

// Expected JSON schema:
// [
//   { "front": "...", "back": "..." }
// ]
// For cloze mode:
// [
//   { "clozeText": "The capital of France is {{c1::Paris}}." }
// ]
export function buildCardGenerationPrompt(params: {
  text: string;
  deckName: string;
  count: number;
  cardType: 'basic' | 'cloze';
}): LlmMessage[] {
  const count = Math.max(1, Math.min(20, params.count));

  const schemaComment =
    params.cardType === 'cloze'
      ? 'Return a JSON array only: [{"clozeText":"..."}]'
      : 'Return a JSON array only: [{"front":"...","back":"..."}]';

  return [
    {
      role: 'system',
      content:
        'You generate revision flashcards. Reply with JSON only. No preamble. No markdown fences. No commentary. ' +
        schemaComment,
    },
    {
      role: 'user',
      content:
        `Deck: ${params.deckName}\n` +
        `Card type: ${params.cardType}\n` +
        `Requested card count: ${count}\n\n` +
        'Source text:\n' +
        params.text,
    },
  ];
}

// Expected JSON schema:
// {
//   "questions": [
//     {
//       "question": "...",
//       "options": ["A", "B", "C", "D"],
//       "answer": "..."
//     }
//   ]
// }
export function buildPracticeTestPrompt(params: {
  text: string;
  subject: string;
  questionCount: number;
  format: 'multiple_choice' | 'short_answer';
}): LlmMessage[] {
  const count = Math.max(1, Math.min(20, params.questionCount));

  return [
    {
      role: 'system',
      content:
        'You generate practice tests. Reply with JSON only. No preamble. No markdown fences. No commentary. ' +
        'Schema: {"questions":[{"question":"...","options":["A","B","C","D"],"answer":"..."}]}. ' +
        'For short_answer format, omit the options field.',
    },
    {
      role: 'user',
      content:
        `Subject: ${params.subject}\n` +
        `Question count: ${count}\n` +
        `Format: ${params.format}\n\n` +
        'Source text:\n' +
        params.text,
    },
  ];
}

// Expected JSON schema:
// { "explanation": "..." }
export function buildExplanationPrompt(params: {
  front: string;
  back: string;
  noteContext?: string;
}): LlmMessage[] {
  return [
    {
      role: 'system',
      content:
        'You explain why a card answer is correct. Reply with JSON only. No preamble. No markdown fences. No commentary. ' +
        'Schema: {"explanation":"..."}',
    },
    {
      role: 'user',
      content:
        `Card front:\n${params.front}\n\n` +
        `Card back:\n${params.back}\n\n` +
        (params.noteContext
          ? `Related note context:\n${params.noteContext}\n\n`
          : '') +
        'Explain succinctly and focus on why the answer is correct.',
    },
  ];
}

// Expected JSON schema:
// { "phrasings": [{ "front": "...", "back": "..." }, ...] }
export function buildAlternativePhrasingsPrompt(params: {
  front: string;
  back: string;
}): LlmMessage[] {
  return [
    {
      role: 'system',
      content:
        'You suggest alternative flashcard phrasings. Reply with JSON only. No preamble. No markdown fences. No commentary. ' +
        'Schema: {"phrasings":[{"front":"...","back":"..."}]}. Provide 3 to 5 alternatives.',
    },
    {
      role: 'user',
      content: `Original front:\n${params.front}\n\nOriginal back:\n${params.back}`,
    },
  ];
}

// Expected JSON schema:
// { "summary": "..." }
export function buildSummarisationPrompt(params: {
  text: string;
  targetLength: 'brief' | 'detailed';
}): LlmMessage[] {
  const lengthInstruction =
    params.targetLength === 'brief'
      ? 'Keep the summary to roughly three sentences.'
      : 'Keep the summary to roughly two short paragraphs.';

  return [
    {
      role: 'system',
      content:
        'You summarise revision notes. Reply with JSON only. No preamble. No markdown fences. No commentary. ' +
        'Schema: {"summary":"..."}.',
    },
    {
      role: 'user',
      content: `${lengthInstruction}\n\nSource text:\n${params.text}`,
    },
  ];
}
