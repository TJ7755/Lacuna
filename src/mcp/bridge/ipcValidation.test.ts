import { describe, expect, it } from 'vitest';
import { isMcpConsentResponse, isMcpInvokeResponse, isMcpScopeResolutionResponse } from './ipcValidation';

describe('MCP IPC response validation', () => {
  it('rejects malformed consent replies', () => {
    expect(isMcpConsentResponse({ id: 'one', approved: true })).toBe(true);
    expect(isMcpConsentResponse({ id: '', approved: true })).toBe(false);
    expect(isMcpConsentResponse({ id: 'one', approved: 'yes' })).toBe(false);
  });

  it('rejects malformed invocation replies', () => {
    expect(isMcpInvokeResponse({ id: 'one', ok: true, result: null })).toBe(true);
    expect(isMcpInvokeResponse({ id: 'one', ok: false, error: { kind: 'internal', message: 'Failed.' } })).toBe(true);
    expect(isMcpInvokeResponse({ id: 'one', ok: false, error: { kind: 'invented', message: 'Failed.' } })).toBe(false);
  });

  it('requires at least one well-formed scope target', () => {
    expect(isMcpScopeResolutionResponse({ id: 'one', ok: true, targets: [{ courseId: 'course-1' }] })).toBe(true);
    expect(isMcpScopeResolutionResponse({ id: 'one', ok: true, targets: [] })).toBe(false);
    expect(isMcpScopeResolutionResponse({ id: 'one', ok: true, targets: [{ courseId: '' }] })).toBe(false);
  });
});
