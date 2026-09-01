import { timingSafeEqual } from 'node:crypto';
import {
  isAiCompanionRequest,
  isCompanionRequest,
  type AiCompanionRequest,
  type CompanionRequest,
} from '../../src/mcp/companionProtocol.js';

export type CompanionPurpose = 'data' | 'ai';
export type CompanionHello = Extract<CompanionRequest, { type: 'hello' }> |
  Extract<AiCompanionRequest, { type: 'ai_hello' }>;

function tokensMatch(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function authoriseCompanionHello(
  value: unknown,
  purpose: 'data',
  expectedToken: string,
): value is Extract<CompanionRequest, { type: 'hello' }>;
export function authoriseCompanionHello(
  value: unknown,
  purpose: 'ai',
  expectedToken: string,
): value is Extract<AiCompanionRequest, { type: 'ai_hello' }>;
export function authoriseCompanionHello(
  value: unknown,
  purpose: CompanionPurpose,
  expectedToken: string,
): value is CompanionHello {
  if (purpose === 'data') {
    return isCompanionRequest(value) && value.type === 'hello' &&
      tokensMatch(value.token, expectedToken);
  }
  return isAiCompanionRequest(value) && value.type === 'ai_hello' &&
    tokensMatch(value.token, expectedToken);
}
