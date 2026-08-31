import { useCallback, useEffect, useRef, useState } from 'react';
import type { ItemFixture, NumericAnswerSpec } from '../db/types';
import { serialiseMarkScheme } from '../items/markSchemeCompiler';
import type { QuestionConceptSet, QuestionDefinition } from '../questions/types';
import { clearDraft, draftKey, loadDraft, saveDraft } from '../utils/drafts';

export type QuestionEditorKind = 'fixed' | 'generated';
export type QuestionAnswerKind = 'numeric' | 'working';

export interface QuestionAuthoringState {
  kind: QuestionEditorKind;
  name: string;
  newConceptName: string;
  lessonId: string;
  targetConceptId: string;
  prerequisiteConceptIds: string[];
  tags: string[];
  suspended: boolean;
  prompt: string;
  explanation: string;
  answerKind: QuestionAnswerKind;
  numericAnswer: NumericAnswerSpec;
  workingSource: string;
  workingFixtures: ItemFixture[];
  generatorConfig: Record<string, string | number | boolean>;
}

export interface QuestionDraftData {
  state: QuestionAuthoringState;
  timestamp: number;
}

export const DEFAULT_GENERATOR_CONFIG: Record<string, string | number | boolean> = {
  minimumRootMagnitude: 1,
  maximumRootMagnitude: 5,
  maximumLeadingCoefficient: 2,
  allowRepeatedRoots: false,
};

export const EMPTY_QUESTION_AUTHORING_STATE: QuestionAuthoringState = {
  kind: 'fixed',
  name: '',
  newConceptName: '',
  lessonId: '',
  targetConceptId: '',
  prerequisiteConceptIds: [],
  tags: [],
  suspended: false,
  prompt: '',
  explanation: '',
  answerKind: 'numeric',
  numericAnswer: { kind: 'exact', value: '' },
  workingSource: '',
  workingFixtures: [],
  generatorConfig: DEFAULT_GENERATOR_CONFIG,
};

function freshEmptyState(): QuestionAuthoringState {
  return {
    ...EMPTY_QUESTION_AUTHORING_STATE,
    prerequisiteConceptIds: [],
    tags: [],
    numericAnswer: { kind: 'exact', value: '' },
    workingFixtures: [],
    generatorConfig: { ...DEFAULT_GENERATOR_CONFIG },
  };
}

export function questionDraftKey(courseId: string, questionId = 'new'): string {
  return draftKey(`question:${courseId}`, questionId);
}

export function createQuestionDraft(
  state: QuestionAuthoringState,
  timestamp = Date.now(),
): QuestionDraftData {
  return { state, timestamp };
}

export function questionStateFromRecord(
  question: QuestionDefinition,
  conceptSet: QuestionConceptSet,
): QuestionAuthoringState {
  const state: QuestionAuthoringState = {
    ...freshEmptyState(),
    kind: question.kind,
    name: question.name,
    lessonId: question.primaryLessonId ?? '',
    targetConceptId: conceptSet.targetConceptIds[0] ?? '',
    prerequisiteConceptIds: conceptSet.prerequisiteConceptIds,
    tags: question.tags,
    suspended: question.suspended,
  };
  if (question.kind === 'generated') {
    state.generatorConfig = question.generatorConfig as Record<string, string | number | boolean>;
    return state;
  }
  state.prompt = question.prompt;
  state.explanation = question.explanation;
  state.answerKind = question.payload.kind;
  if (question.payload.kind === 'numeric') {
    state.numericAnswer = question.payload.answer;
  } else {
    state.workingSource = serialiseMarkScheme(question.payload.scheme);
    state.workingFixtures = question.payload.fixtures ?? [];
  }
  return state;
}

export function newQuestionState(targetConceptId: string): QuestionAuthoringState {
  return { ...freshEmptyState(), targetConceptId };
}

export function useQuestionDraft(key: string) {
  const [state, setState] = useState<QuestionAuthoringState>(freshEmptyState);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState(false);
  const keyRef = useRef(key);
  const stateRef = useRef(state);
  const baselineRef = useRef(state);
  const dirtyRef = useRef(false);
  const promptRef = useRef(false);
  const timerRef = useRef<number>();
  stateRef.current = state;

  const persist = useCallback(() => {
    if (!dirtyRef.current || promptRef.current) return;
    saveDraft(keyRef.current, createQuestionDraft(stateRef.current));
  }, []);

  useEffect(() => {
    if (keyRef.current === key) return;
    persist();
    window.clearTimeout(timerRef.current);
    keyRef.current = key;
    const empty = freshEmptyState();
    stateRef.current = empty;
    baselineRef.current = empty;
    dirtyRef.current = false;
    promptRef.current = false;
    setState(empty);
    setLoaded(false);
    setDirty(false);
    setDraftPrompt(false);
  }, [key, persist]);

  const initialise = useCallback(
    (initialState: QuestionAuthoringState) => {
      if (loaded) return;
      baselineRef.current = initialState;
      stateRef.current = initialState;
      setState(initialState);
      const stored = loadDraft<QuestionDraftData>(keyRef.current);
      const hasStoredDraft = stored !== null;
      promptRef.current = hasStoredDraft;
      setDraftPrompt(hasStoredDraft);
      setLoaded(true);
    },
    [loaded],
  );

  const update = useCallback(
    (
      patch:
        | Partial<QuestionAuthoringState>
        | ((current: QuestionAuthoringState) => Partial<QuestionAuthoringState>),
    ) => {
      const current = stateRef.current;
      const applied = typeof patch === 'function' ? patch(current) : patch;
      const changed = (Object.keys(applied) as (keyof QuestionAuthoringState)[]).some(
        (key) => !Object.is(current[key], applied[key]),
      );
      if (!changed) return;
      const next = { ...current, ...applied };
      stateRef.current = next;
      setState(next);
      dirtyRef.current = true;
      setDirty(true);
    },
    [],
  );

  const restoreDraft = useCallback(() => {
    const stored = loadDraft<QuestionDraftData>(keyRef.current);
    if (!stored) return;
    stateRef.current = stored.state;
    dirtyRef.current = true;
    promptRef.current = false;
    setState(stored.state);
    setDirty(true);
    setDraftPrompt(false);
  }, []);

  const discardDraft = useCallback(() => {
    window.clearTimeout(timerRef.current);
    clearDraft(keyRef.current);
    stateRef.current = baselineRef.current;
    dirtyRef.current = false;
    promptRef.current = false;
    setState(baselineRef.current);
    setDirty(false);
    setDraftPrompt(false);
  }, []);

  const finish = useCallback(() => {
    window.clearTimeout(timerRef.current);
    clearDraft(keyRef.current);
    dirtyRef.current = false;
    promptRef.current = false;
    setDirty(false);
    setDraftPrompt(false);
  }, []);

  useEffect(() => {
    if (!loaded || !dirty || draftPrompt) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(persist, 800);
    return () => window.clearTimeout(timerRef.current);
  }, [draftPrompt, dirty, loaded, persist, state]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const shouldBlock = useCallback(() => dirtyRef.current, []);

  return {
    state,
    loaded,
    dirty,
    draftPrompt,
    initialise,
    update,
    restoreDraft,
    discardDraft,
    flushDraft: persist,
    finish,
    shouldBlock,
  };
}
