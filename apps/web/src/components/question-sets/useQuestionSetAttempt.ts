import { useEffect, useReducer, useState, useSyncExternalStore } from 'react';
import { liveQuery } from 'dexie';
import { useBlocker } from 'react-router-dom';
import { getQuestionSetAttempt } from '../../questions/questionSetAttemptRepository';
import { QuestionSetAttemptSession } from './questionSetAttemptSession';

export function useQuestionSetAttempt(courseId: string, setId: string, attemptId: string) {
  const [session, setSession] = useState<QuestionSetAttemptSession | null>(null);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [loadAttempt, retryLoad] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    let cancelled = false;
    setSession(null);
    setError('');
    setMissing(false);
    void getQuestionSetAttempt(attemptId)
      .then((record) => {
        if (cancelled) return;
        if (!record || record.courseId !== courseId || record.questionSetId !== setId) {
          setMissing(true);
        } else setSession(new QuestionSetAttemptSession(record, getQuestionSetAttempt));
      })
      .catch((cause) => {
        if (!cancelled) setError(String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, setId, attemptId, loadAttempt]);
  // Background marking writes the stored attempt; follow it so later saves start from it.
  useEffect(() => {
    if (!session) return;
    const subscription = liveQuery(() => getQuestionSetAttempt(attemptId)).subscribe({
      next: (record) => {
        if (record) session.adopt(record);
      },
      error: () => undefined,
    });
    return () => subscription.unsubscribe();
  }, [session, attemptId]);
  return { session, error, missing, retryLoad };
}

export function useAttemptProgress(session: QuestionSetAttemptSession, formDirty = false) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const flush = session.flushDrafts;
  useEffect(() => {
    if (!session.dirty || snapshot.error) return;
    const timer = setTimeout(() => {
      void flush().catch(() => undefined);
    }, 450);
    return () => clearTimeout(timer);
  }, [session, snapshot.draftVersion, flush, snapshot.error]);
  // Keep unsaved text protected until the learner explicitly leaves after a save error.
  const dirty = session.dirty || formDirty;
  const unfinished = session.unfinished || formDirty;
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state === 'blocked' && !snapshot.error && !unfinished) {
      void flush()
        .then(() => blocker.proceed())
        .catch(() => undefined);
    }
  }, [blocker, flush, snapshot.error, unfinished]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (session.dirty || formDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [session, formDirty]);
  return {
    ...snapshot,
    dirty,
    blocker,
    flush,
    value: session.value,
    edit: session.edit,
    retry: session.retry,
  };
}
