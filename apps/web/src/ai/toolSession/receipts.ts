import { aiActionReceiptSchema } from '../protocol';
import type { AiActionReceipt, AiEntityReference, JsonValue } from '../protocol';

const GLOBAL_SCOPE_KEY = '__global__';

interface ScopeTarget {
  courseId: string;
  label?: string;
}

interface CreateReceiptInput {
  callId: string;
  toolName: string;
  input: unknown;
  result: JsonValue;
  target: ScopeTarget;
  completedAt: number;
  createId: () => string;
}

export function targetLabel(target: ScopeTarget): string {
  return shortLabel(
    target.label,
    target.courseId === GLOBAL_SCOPE_KEY ? 'All Lacuna data' : target.courseId,
  );
}

function targetReference(target: ScopeTarget): {
  kind: 'course';
  id: string;
  label: string;
} {
  return { kind: 'course', id: target.courseId, label: targetLabel(target) };
}

function summaryFor(toolName: string): string {
  return `Completed ${toolName}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function shortLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const compact = value.trim().replace(/\s+/g, ' ');
  if (compact === '') return fallback;
  return compact.length > 120 ? `${compact.slice(0, 119)}…` : compact;
}

export function makeReceipt(input: CreateReceiptInput): AiActionReceipt {
  let reference: AiEntityReference = targetReference(input.target);
  let summary = summaryFor(input.toolName);
  const toolInput = record(input.input);
  const result = record(input.result);
  if (input.toolName === 'lacuna.create_course' && toolInput) {
    const name = shortLabel(toolInput.name, 'Course');
    if (result) {
      const created = result;
      if (typeof created.id === 'string') {
        reference = {
          kind: 'course',
          id: created.id,
          label: shortLabel(created.name, name),
        };
        summary = `Created ${name}`;
      }
    }
  } else if (input.toolName === 'lacuna.create_lesson' && toolInput && result) {
    const name = shortLabel(toolInput.name, 'Lesson');
    if (typeof result.id === 'string') {
      reference = {
        kind: 'lesson',
        id: result.id,
        courseId: input.target.courseId,
        label: name,
      };
      summary = `Created ${name}`;
    }
  } else if (input.toolName === 'lacuna.create_card' && toolInput && result) {
    const label = shortLabel(toolInput.front, 'Card');
    if (typeof result.id === 'string') {
      reference = {
        kind: 'card',
        id: result.id,
        courseId: input.target.courseId,
        label,
      };
      summary = `Created card: ${label}`;
    }
  } else if (input.toolName === 'lacuna.create_fixed_question' && toolInput && result) {
    const question = record(result.question);
    const label = shortLabel(question?.name ?? toolInput.name, 'Question');
    if (question && typeof question.id === 'string') {
      reference = {
        kind: 'question',
        id: question.id,
        courseId: input.target.courseId,
        label,
      };
      summary = `Created Question: ${label}`;
    }
  } else if (input.toolName === 'lacuna.create_course_assessment' && toolInput && result) {
    const label = shortLabel(result.name ?? toolInput.name, 'Assessment');
    if (typeof result.id === 'string') {
      reference = {
        kind: 'assessment',
        id: result.id,
        courseId: input.target.courseId,
        label,
      };
      summary = `Created assessment: ${label}`;
    }
  }
  return aiActionReceiptSchema.parse({
    receiptId: input.createId(),
    callId: input.callId,
    toolName: input.toolName,
    summary,
    createdAt: input.completedAt,
    targets: [reference],
  });
}

export function summaryForTool(toolName: string): string {
  return summaryFor(toolName);
}
