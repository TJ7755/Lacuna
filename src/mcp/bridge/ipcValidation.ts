import type { McpConsentResponse, McpInvokeResponse, McpScopeResolutionResponse } from './protocol';

const ERROR_KINDS = new Set(['not_found', 'validation', 'forbidden', 'conflict', 'internal']);

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function validError(value: unknown): boolean {
  const item = record(value);
  return !!item && typeof item.message === 'string' && ERROR_KINDS.has(String(item.kind));
}

export function isMcpConsentResponse(value: unknown): value is McpConsentResponse {
  const item = record(value);
  return !!item && typeof item.id === 'string' && item.id.length > 0 && typeof item.approved === 'boolean';
}

export function isMcpInvokeResponse(value: unknown): value is McpInvokeResponse {
  const item = record(value);
  if (!item || typeof item.id !== 'string' || item.id.length === 0 || typeof item.ok !== 'boolean') return false;
  return item.ok ? Object.prototype.hasOwnProperty.call(item, 'result') : validError(item.error);
}

export function isMcpScopeResolutionResponse(value: unknown): value is McpScopeResolutionResponse {
  const item = record(value);
  if (!item || typeof item.id !== 'string' || item.id.length === 0 || typeof item.ok !== 'boolean') return false;
  if (!item.ok) return validError(item.error);
  return Array.isArray(item.targets) && item.targets.length > 0 && item.targets.every((target) => {
    const candidate = record(target);
    return !!candidate && typeof candidate.courseId === 'string' && candidate.courseId.length > 0 &&
      (candidate.label === undefined || typeof candidate.label === 'string');
  });
}
