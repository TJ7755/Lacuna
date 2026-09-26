import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import {
  createQuestionSetDraftSession,
  type QuestionSetDraftSession,
  type QuestionSetDraftSessionSnapshot,
} from '../../questions/questionSetDraftSession';
import { createQuestionSetDraft, loadQuestionSetDraft } from '../../questions/questionSetDrafts';
import { getQuestionSet } from '../../questions/questionSetRepository';

export function useQuestionSetEditor(courseId: string, setId: string) {
  const [session, setSession] = useState<QuestionSetDraftSession | null>(null);
  const [snapshot, setSnapshot] = useState<QuestionSetDraftSessionSnapshot | null>(null);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let owned: QuestionSetDraftSession | null = null;
    let unsubscribe = () => {};
    setSession(null);
    setSnapshot(null);
    setLoadError('');
    void (async () => {
      try {
        const [draft, saved] = await Promise.all([
          loadQuestionSetDraft(courseId, setId),
          getQuestionSet(setId),
        ]);
        if (cancelled) return;
        if (!draft && (!saved || saved.courseId !== courseId))
          throw new Error('This question set could not be found.');
        const initialDraft = draft ?? createQuestionSetDraft(saved!, saved!.contentRevisionId);
        owned = createQuestionSetDraftSession({ initialDraft, debounceMs: 500 });
        unsubscribe = owned.subscribe(() => {
          if (!cancelled) setSnapshot(owned!.getSnapshot());
        });
        await owned.load();
        if (!cancelled) {
          setSession(owned);
          setSnapshot(owned.getSnapshot());
          void owned.flush().catch(() => undefined);
        }
      } catch (cause) {
        if (!cancelled)
          setLoadError(cause instanceof Error ? cause.message : 'Could not load this draft.');
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe();
      if (owned) void owned.dispose().catch(() => undefined);
    };
  }, [courseId, setId]);
  const blocker = useBlocker(
    Boolean(snapshot?.dirty || snapshot?.phase === 'saving' || snapshot?.phase === 'publishing'),
  );
  useEffect(() => {
    if (blocker.state === 'blocked' && session && snapshot?.phase !== 'error') {
      void session
        .flush()
        .then(() => blocker.proceed())
        .catch(() => undefined);
    }
  }, [blocker, session, snapshot?.phase]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (session?.getSnapshot().dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [session]);
  return { session, snapshot, loadError, blocker };
}
