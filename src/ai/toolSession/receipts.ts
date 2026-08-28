import { aiActionReceiptSchema } from '../protocol';
import type { AiActionReceipt, JsonValue } from '../protocol';

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
  return (
    target.label ?? (target.courseId === GLOBAL_SCOPE_KEY ? 'All Lacuna data' : target.courseId)
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

export function makeReceipt(input: CreateReceiptInput): AiActionReceipt {
  let reference = targetReference(input.target);
  let summary = summaryFor(input.toolName);
  if (input.toolName === 'lacuna.create_course' && input.input && typeof input.input === 'object') {
    const name = (input.input as Record<string, unknown>).name;
    if (
      typeof name === 'string' &&
      input.result &&
      typeof input.result === 'object' &&
      !Array.isArray(input.result)
    ) {
      const created = input.result as Record<string, unknown>;
      if (typeof created.id === 'string') {
        reference = {
          kind: 'course',
          id: created.id,
          label: typeof created.name === 'string' ? created.name : name,
        };
        summary = `Created ${name}`;
      }
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
