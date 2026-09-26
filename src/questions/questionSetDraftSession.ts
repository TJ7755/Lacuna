import type { QuestionSetRecord } from './questionSetCodec';
import { QuestionSetRevisionConflictError } from './questionSetRepository';
import { assetUrl, prepareImageAsset } from '../db/assets';
import type { MediaAsset } from '../db/types';
import { compressImageBlob } from '../utils/compressImage';
import { updateQuestionSetNodePrompt } from './questionSetAuthoring';
import {
  loadQuestionSetDraft,
  publishQuestionSetDraft,
  saveQuestionSetDraft,
  saveQuestionSetDraftWithAssets,
  type QuestionSetDraft,
  QuestionSetDraftConflictError,
} from './questionSetDrafts';
import type { QuestionSet } from './questionSets';

export type QuestionSetDraftSessionPhase =
  'idle' | 'loading' | 'saving' | 'publishing' | 'error' | 'disposed';

export interface QuestionSetDraftSessionSnapshot {
  draft: QuestionSetDraft | null;
  dirty: boolean;
  phase: QuestionSetDraftSessionPhase;
  error: unknown | null;
  requiresReload: boolean;
  conflictSource: 'draft' | 'published' | null;
}

export interface QuestionSetDraftSessionStorage {
  load(courseId: string, setId: string): Promise<QuestionSetDraft | null>;
  save(
    draft: QuestionSetDraft,
    options: { expectedDraftRevisionId: string | null },
  ): Promise<QuestionSetDraft>;
  publish(
    courseId: string,
    setId: string,
    expectedDraftRevisionId: string,
  ): Promise<QuestionSetRecord>;
  saveWithAssets(
    draft: QuestionSetDraft,
    assets: readonly MediaAsset[],
    options: { expectedDraftRevisionId: string | null },
  ): Promise<QuestionSetDraft>;
}

const DEFAULT_STORAGE: QuestionSetDraftSessionStorage = {
  load: loadQuestionSetDraft,
  save: saveQuestionSetDraft,
  publish: publishQuestionSetDraft,
  saveWithAssets: saveQuestionSetDraftWithAssets,
};

export interface QuestionSetDraftSessionOptions {
  initialDraft: QuestionSetDraft;
  debounceMs?: number;
  storage?: QuestionSetDraftSessionStorage;
  prepareImage?: (file: File) => Promise<MediaAsset>;
}

type Listener = () => void;

export class QuestionSetDraftSession {
  private readonly storage: QuestionSetDraftSessionStorage;
  private readonly initialDraft: QuestionSetDraft;
  private readonly debounceMs: number;
  private readonly listeners = new Set<Listener>();
  private readonly prepareImage: (file: File) => Promise<MediaAsset>;
  private snapshot: QuestionSetDraftSessionSnapshot = {
    draft: null,
    dirty: false,
    phase: 'idle',
    error: null,
    requiresReload: false,
    conflictSource: null,
  };
  private expectedDraftRevisionId: string | null = null;
  private generation = 0;
  private savedGeneration = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private savePromise: Promise<void> | null = null;
  private pendingAssets: MediaAsset[] = [];
  private disposed = false;

  constructor(options: QuestionSetDraftSessionOptions) {
    this.storage = options.storage ?? DEFAULT_STORAGE;
    this.initialDraft = structuredClone(options.initialDraft);
    this.debounceMs = options.debounceMs ?? 800;
    this.prepareImage =
      options.prepareImage ??
      (async (file) => {
        const compressed = await compressImageBlob(file);
        return prepareImageAsset(
          compressed.blob,
          compressed.blob.type || file.type,
          compressed.width,
          compressed.height,
        );
      });
  }

  getSnapshot = (): QuestionSetDraftSessionSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(next: Partial<QuestionSetDraftSessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener());
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private assertEditable(): QuestionSetDraft {
    if (!this.snapshot.draft) throw new Error('Load the Question Set draft before editing it.');
    if (this.snapshot.phase === 'publishing') throw new Error('The Question Set is publishing.');
    if (this.disposed) throw new Error('The Question Set draft session is disposed.');
    if (this.snapshot.phase === 'error' && this.snapshot.requiresReload) throw this.snapshot.error;
    return this.snapshot.draft;
  }

  async load(options: { discardLocalChanges?: boolean } = {}): Promise<QuestionSetDraft> {
    if (this.disposed) throw new Error('The Question Set draft session is disposed.');
    if (
      this.snapshot.draft &&
      (this.snapshot.dirty || this.snapshot.error) &&
      !options.discardLocalChanges
    ) {
      throw new Error('Confirm discarding local Question Set changes before reloading.');
    }
    this.clearTimer();
    if (this.savePromise) {
      try {
        await this.savePromise;
      } catch {
        // Reload is the explicit recovery path after a failed or conflicting save.
      }
    }
    this.pendingAssets = [];
    this.emit({ phase: 'loading', error: null, requiresReload: false, conflictSource: null });
    try {
      const stored = await this.storage.load(
        this.initialDraft.content.courseId,
        this.initialDraft.content.id,
      );
      if (this.disposed) throw new Error('The Question Set draft session is disposed.');
      const draft = structuredClone(stored ?? this.initialDraft);
      this.expectedDraftRevisionId = stored?.draftRevisionId ?? null;
      this.generation = stored ? 0 : 1;
      this.savedGeneration = 0;
      this.emit({
        draft,
        dirty: !stored,
        phase: 'idle',
        error: null,
        requiresReload: false,
        conflictSource: null,
      });
      return draft;
    } catch (error) {
      if (!this.disposed)
        this.emit({ phase: 'error', error, requiresReload: false, conflictSource: null });
      throw error;
    }
  }

  update(update: (content: QuestionSet) => QuestionSet): void {
    const draft = this.assertEditable();
    const content = update(structuredClone(draft.content));
    this.generation += 1;
    this.emit({
      draft: { ...draft, content },
      dirty: true,
      phase: 'idle',
      error: null,
      requiresReload: false,
      conflictSource: null,
    });
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush().catch(() => undefined);
    }, this.debounceMs);
  }

  async insertImage(nodeId: string, file: File, alt: string): Promise<string> {
    if (!alt.trim()) throw new Error('Describe the image before adding it.');
    this.assertEditable();
    const asset = await this.prepareImage(file);
    this.assertEditable();
    const url = assetUrl(asset.hash);
    const safeAlt = alt.trim().replaceAll(']', '\\]');
    this.pendingAssets.push(asset);
    this.update((content) => {
      const node = flattenNode(content, nodeId);
      const separator = node.prompt ? '\n\n' : '';
      return updateQuestionSetNodePrompt(
        content,
        nodeId,
        `${node.prompt}${separator}![${safeAlt}](${url})`,
      );
    });
    await this.flush();
    return url;
  }

  async flush(): Promise<void> {
    this.clearTimer();
    if (this.disposed) throw new Error('The Question Set draft session is disposed.');
    if (this.snapshot.phase === 'error') throw this.snapshot.error;
    if (!this.snapshot.draft || this.savedGeneration === this.generation) return;
    if (this.savePromise) return this.savePromise;

    this.savePromise = this.saveLoop().finally(() => {
      this.savePromise = null;
    });
    return this.savePromise;
  }

  private async saveLoop(): Promise<void> {
    try {
      while (this.savedGeneration < this.generation) {
        const attemptGeneration = this.generation;
        const attempt = structuredClone(this.snapshot.draft!);
        const attemptAssets = [...this.pendingAssets];
        this.emit({ phase: 'saving', error: null });
        const saved =
          attemptAssets.length > 0
            ? await this.storage.saveWithAssets(attempt, attemptAssets, {
                expectedDraftRevisionId: this.expectedDraftRevisionId,
              })
            : await this.storage.save(attempt, {
                expectedDraftRevisionId: this.expectedDraftRevisionId,
              });
        this.pendingAssets = this.pendingAssets.slice(attemptAssets.length);
        this.expectedDraftRevisionId = saved.draftRevisionId;
        this.savedGeneration = attemptGeneration;
        const latestContent =
          this.generation === attemptGeneration ? saved.content : this.snapshot.draft!.content;
        this.emit({
          draft: { ...saved, content: latestContent },
          dirty: this.savedGeneration < this.generation,
          phase: 'saving',
        });
      }
      this.emit({
        dirty: false,
        phase: 'idle',
        error: null,
        requiresReload: false,
        conflictSource: null,
      });
    } catch (error) {
      this.emit({
        dirty: this.savedGeneration < this.generation,
        phase: 'error',
        error,
        requiresReload: error instanceof QuestionSetDraftConflictError,
        conflictSource: error instanceof QuestionSetDraftConflictError ? 'draft' : null,
      });
      throw error;
    }
  }

  async retry(): Promise<void> {
    if (this.snapshot.phase !== 'error') return this.flush();
    if (this.snapshot.requiresReload) throw this.snapshot.error;
    this.emit({ phase: 'idle', error: null, requiresReload: false, conflictSource: null });
    return this.flush();
  }

  async publish(): Promise<QuestionSetRecord> {
    await this.flush();
    const draft = this.assertEditable();
    if (!this.expectedDraftRevisionId) {
      throw new Error('Save the Question Set draft before publishing it.');
    }
    this.emit({ phase: 'publishing', error: null });
    try {
      const record = await this.storage.publish(
        draft.content.courseId,
        draft.content.id,
        this.expectedDraftRevisionId,
      );
      this.expectedDraftRevisionId = null;
      this.emit({
        draft: null,
        dirty: false,
        phase: 'idle',
        error: null,
        requiresReload: false,
        conflictSource: null,
      });
      return record;
    } catch (error) {
      this.emit({
        phase: 'error',
        error,
        requiresReload: error instanceof QuestionSetDraftConflictError,
        conflictSource:
          error instanceof QuestionSetDraftConflictError
            ? 'draft'
            : error instanceof QuestionSetRevisionConflictError
              ? 'published'
              : null,
      });
      throw error;
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.clearTimer();
    if (this.snapshot.phase !== 'loading') await this.flush();
    this.disposed = true;
    this.listeners.clear();
    this.snapshot = { ...this.snapshot, phase: 'disposed' };
  }
}

function flattenNode(content: QuestionSet, nodeId: string) {
  for (const question of content.questions) {
    if (question.id === nodeId) return question;
    for (const part of question.parts) {
      if (part.id === nodeId) return part;
      for (const subpart of part.subparts) if (subpart.id === nodeId) return subpart;
    }
  }
  throw new Error(`Question Set node ${nodeId} was not found.`);
}

export function createQuestionSetDraftSession(
  options: QuestionSetDraftSessionOptions,
): QuestionSetDraftSession {
  return new QuestionSetDraftSession(options);
}
