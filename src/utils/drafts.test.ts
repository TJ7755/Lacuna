import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, draftKey, loadDraft, saveDraft } from './drafts';

interface AlternateDraft {
  mode: 'generated';
  configuration: Record<string, number | boolean>;
  timestamp: number;
}

describe('draft storage', () => {
  beforeEach(() => localStorage.clear());

  it('stores typed drafts without coupling storage to Card fields', () => {
    const key = draftKey('question:course-1', 'question-1');
    const draft: AlternateDraft = {
      mode: 'generated',
      configuration: { maximum: 8, repeated: false },
      timestamp: 42,
    };

    saveDraft(key, draft);

    expect(loadDraft<AlternateDraft>(key)).toEqual(draft);
  });

  it('keeps route identities isolated', () => {
    const first = draftKey('question:course-1', 'question-1');
    const second = draftKey('question:course-1', 'question-2');

    saveDraft(first, { mode: 'generated', configuration: {}, timestamp: 1 });

    expect(loadDraft<AlternateDraft>(second)).toBeNull();
  });

  it('does not let storage cleanup failures interrupt a successful save flow', () => {
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
      throw new Error('Storage unavailable');
    });

    expect(() => clearDraft('question:course-1')).not.toThrow();
    expect(remove).toHaveBeenCalledOnce();
  });
});
