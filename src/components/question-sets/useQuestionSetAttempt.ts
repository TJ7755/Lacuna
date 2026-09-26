import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useBlocker } from 'react-router-dom';
import {
  getQuestionSetAttempt,
  saveQuestionSetResponseDraft,
} from '../../questions/questionSetAttemptRepository';
import type {
  QuestionSetAttemptRecord,
  QuestionSetResponseValue,
} from '../../questions/questionSetAttempts';
import { QuestionSetAttemptSession } from './questionSetAttemptSession';

export function useQuestionSetAttempt(courseId: string, setId: string, attemptId: string) {
  const [session, setSession] = useState<QuestionSetAttemptSession | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setSession(null);
    setError('');
    void getQuestionSetAttempt(attemptId)
      .then((record) => {
        if (cancelled) return;
        if (!record || record.courseId !== courseId || record.questionSetId !== setId) {
          setError('This attempt could not be found.');
        } else setSession(new QuestionSetAttemptSession(record));
      })
      .catch((cause) => {
        if (!cancelled) setError(String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, setId, attemptId]);
  return { session, error };
}

export function useAttemptProgress(session: QuestionSetAttemptSession, formDirty = false) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const drafts = useRef(new Map<string, QuestionSetResponseValue>());
  const [draftVersion, setDraftVersion] = useState(0);
  const flushing = useRef<Promise<void> | null>(null);
  const [saving, setSaving] = useState(false);
  const flush = useCallback((): Promise<void> => {
    if (flushing.current) return flushing.current;
    setSaving(true);
    const work = (async () => {
      do {
        while (drafts.current.size) {
          const [nodeId, value] = drafts.current.entries().next().value!;
          await session.run((record) =>
            saveQuestionSetResponseDraft(
              record.id,
              record.revisionId,
              nodeId,
              value,
              record.activeNodeId,
            ),
          );
          if (drafts.current.get(nodeId) === value) drafts.current.delete(nodeId);
        }
        await session.flush();
      } while (drafts.current.size);
    })().finally(() => {
      flushing.current = null;
      setSaving(false);
    });
    flushing.current = work;
    return work;
  }, [session]);
  useEffect(() => {
    if (!drafts.current.size || snapshot.error) return;
    const timer = setTimeout(() => {
      void flush().catch(() => undefined);
    }, 450);
    return () => clearTimeout(timer);
  }, [draftVersion, flush, snapshot.error]);
  const dirty =
    drafts.current.size > 0 || snapshot.pending > 0 || Boolean(snapshot.error) || formDirty;
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state === 'blocked' && !snapshot.error && !formDirty) {
      void flush()
        .then(() => blocker.proceed())
        .catch(() => undefined);
    }
  }, [blocker, flush, snapshot.error, formDirty]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (drafts.current.size || session.snapshot.pending || session.snapshot.error || formDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [session, formDirty]);
  const run = async (
    command: (record: QuestionSetAttemptRecord) => Promise<QuestionSetAttemptRecord>,
  ) => {
    await flush();
    return session.run(command);
  };
  return {
    ...snapshot,
    dirty,
    saving,
    blocker,
    flush,
    run,
    value(nodeId: string) {
      return (
        drafts.current.get(nodeId) ??
        snapshot.record.responses.find((row) => row.nodeId === nodeId)!.draft
      );
    },
    edit(nodeId: string, value: QuestionSetResponseValue) {
      drafts.current.set(nodeId, value);
      setDraftVersion((version) => version + 1);
    },
    async retry() {
      await session.retry();
      await flush();
    },
  };
}
