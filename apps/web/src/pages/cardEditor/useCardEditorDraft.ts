import { useEffect, useMemo, useRef, useState } from 'react';
import { EDITOR_TYPE_ORDER, type EditorCardType } from '../../components/cards/CardTypePicker';
import type { AnswerMode, Card, ItemFixture, NumericAnswerSpec } from '../../db/types';
import { compileMarkScheme, serialiseMarkScheme } from '../../items/markSchemeCompiler';
import { isAudioCardFront } from '../../media/audio';
import { saveDraft, loadDraft, clearDraft } from '../../utils/drafts';

export const EMPTY_NUMERIC_ANSWER: NumericAnswerSpec = { kind: 'exact', value: '' };

export function useCardEditorDraft({
  currentDraftKey,
  editing,
  card,
}: {
  currentDraftKey: string;
  editing: boolean;
  card: Card | null | undefined;
}) {
  const [type, setType] = useState<EditorCardType>('front_back');
  // Which way the form moves when the type changes: towards the pill that was chosen.
  const [formDirection, setFormDirection] = useState(0);
  const [answerMode, setAnswerMode] = useState<AnswerMode>();
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [numericAnswer, setNumericAnswer] = useState<NumericAnswerSpec>(EMPTY_NUMERIC_ANSWER);
  const [workingSource, setWorkingSource] = useState('');
  const [workingFixtures, setWorkingFixtures] = useState<ItemFixture[]>([]);
  const workingCompilation = useMemo(() => compileMarkScheme(workingSource), [workingSource]);
  const [tags, setTags] = useState<string[]>([]);
  // When set (new front/back cards only), saving also creates an independent reverse card.
  const [alsoReverse, setAlsoReverse] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Autosave begins only after an author changes a seeded field. Without this latch,
  // mounting an existing card fabricates a draft and mounting over a real draft can erase it.
  const [draftDirty, setDraftDirty] = useState(false);
  // Whether a stored draft was found and is offered for restoration.
  const [draftPrompt, setDraftPrompt] = useState(false);
  const draftKeyRef = useRef(currentDraftKey);
  const draftTimer = useRef<number | undefined>(undefined);

  // Persist the current form state under the key in draftKeyRef. Shared by the
  // debounced autosave and the route-change flush below.
  function persistDraft() {
    saveDraft(draftKeyRef.current, {
      type: type === 'numeric' || type === 'working' || type === 'audio' ? 'front_back' : type,
      itemKind: type === 'numeric' || type === 'working' || type === 'audio' ? type : undefined,
      front,
      back,
      tags,
      alsoReverse,
      answerMode,
      payload:
        type === 'numeric'
          ? { v: 1, kind: 'numeric', answer: numericAnswer }
          : type === 'working'
            ? {
                v: 1,
                kind: 'working',
                scheme: workingCompilation.lines.flatMap((line) =>
                  line.kind === 'compiled' ? [line.value] : [],
                ),
                ...(workingFixtures.length > 0 ? { fixtures: workingFixtures } : {}),
              }
            : undefined,
      workingSource: type === 'working' ? workingSource : undefined,
      timestamp: Date.now(),
    });
  }
  // Effects that must not re-run on every keystroke reach the latest persistDraft
  // through this stable handle rather than a dependency.
  const persistDraftRef = useRef(persistDraft);
  persistDraftRef.current = persistDraft;

  // Re-arm the loaded latch whenever the card being edited changes so direct
  // navigation between cards (same route, different param) re-seeds the form.
  // Flush the outgoing card first: the route change cancels the only pending
  // autosave timer, and the un-debounced edit would otherwise be lost with the
  // source draft key.
  useEffect(() => {
    if (loaded && draftDirty && !draftPrompt) persistDraftRef.current();
    window.clearTimeout(draftTimer.current);
    draftKeyRef.current = currentDraftKey;
    setLoaded(false);
    setAnswerMode(undefined);
    setDraftDirty(false);
    setDraftPrompt(false);
    // Deliberately keyed on the draft key alone; form state is read through persistDraftRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDraftKey]);

  function modifyDraftField<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setDraftDirty(true);
  }

  // Seed the form from the card being edited once it has loaded (new cards start blank).
  // If a draft exists, offer it instead of the persisted state.
  useEffect(() => {
    if (loaded) return;
    if (!editing) {
      // New card: check for a draft from a previous abandoned session.
      const draft = loadDraft(draftKeyRef.current);
      if (draft && draft.front.trim()) {
        setDraftPrompt(true);
      }
      setLoaded(true);
      return;
    }
    if (card) {
      const draft = loadDraft(draftKeyRef.current);
      if (draft && draft.timestamp > 0) {
        setDraftPrompt(true);
      } else {
        setType(
          card.payload?.kind === 'numeric'
            ? 'numeric'
            : card.payload?.kind === 'working'
              ? 'working'
              : isAudioCardFront(card.front)
                ? 'audio'
                : card.type,
        );
        setAnswerMode(card.answerMode);
        setFront(card.front);
        setBack(card.back);
        if (card.payload?.kind === 'numeric') setNumericAnswer(card.payload.answer);
        if (card.payload?.kind === 'working') {
          setWorkingSource(serialiseMarkScheme(card.payload.scheme));
          setWorkingFixtures(card.payload.fixtures ?? []);
        }
        setTags(card.tags ?? []);
      }
      setLoaded(true);
    }
  }, [editing, card, loaded]);

  const applyDraft = () => {
    const draft = loadDraft(draftKeyRef.current);
    if (!draft) return;
    setFormDirection(0);
    setType(
      draft.itemKind === 'numeric' || draft.itemKind === 'working' || draft.itemKind === 'audio'
        ? draft.itemKind
        : draft.type,
    );
    setAnswerMode(draft.answerMode);
    setFront(draft.front);
    setBack(draft.back);
    setTags(draft.tags);
    if (draft.payload?.kind === 'numeric') setNumericAnswer(draft.payload.answer);
    if (draft.itemKind === 'working') {
      setWorkingSource(
        draft.workingSource ??
          (draft.payload?.kind === 'working' ? serialiseMarkScheme(draft.payload.scheme) : ''),
      );
      setWorkingFixtures(draft.payload?.kind === 'working' ? (draft.payload.fixtures ?? []) : []);
    }
    if (draft.alsoReverse !== undefined) setAlsoReverse(draft.alsoReverse);
    setDraftDirty(false);
    setDraftPrompt(false);
  };

  const discardDraft = () => {
    clearDraft(draftKeyRef.current);
    setDraftDirty(false);
    setDraftPrompt(false);
    if (editing && card) {
      setType(
        card.payload?.kind === 'numeric'
          ? 'numeric'
          : card.payload?.kind === 'working'
            ? 'working'
            : isAudioCardFront(card.front)
              ? 'audio'
              : card.type,
      );
      setAnswerMode(card.answerMode);
      setFront(card.front);
      setBack(card.back);
      setTags(card.tags ?? []);
      if (card.payload?.kind === 'numeric') setNumericAnswer(card.payload.answer);
      if (card.payload?.kind === 'working') {
        setWorkingSource(serialiseMarkScheme(card.payload.scheme));
        setWorkingFixtures(card.payload.fixtures ?? []);
      }
    }
  };

  // Auto-save only author-initiated changes, and never while a stored draft is awaiting a
  // restore/discard decision. State seeding is deliberately excluded from the dirty boundary.
  useEffect(() => {
    if (!loaded || !draftDirty || draftPrompt) return;
    window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => persistDraftRef.current(), 800);
    return () => window.clearTimeout(draftTimer.current);
  }, [
    loaded,
    draftDirty,
    draftPrompt,
    type,
    front,
    back,
    tags,
    alsoReverse,
    answerMode,
    numericAnswer,
    workingCompilation,
    workingFixtures,
    workingSource,
  ]);

  // Another kind of authoring takes over from this page; anything typed stays as a draft.
  function leaveForm(go: () => void) {
    window.clearTimeout(draftTimer.current);
    if (loaded && draftDirty && !draftPrompt) persistDraft();
    go();
  }

  function changeType(next: EditorCardType) {
    setFormDirection(Math.sign(EDITOR_TYPE_ORDER.indexOf(next) - EDITOR_TYPE_ORDER.indexOf(type)));
    setType(next);
    setDraftDirty(true);
  }

  function clearSavedDraft() {
    clearDraft(draftKeyRef.current);
    setDraftDirty(false);
  }

  return {
    values: {
      type,
      answerMode,
      front,
      back,
      numericAnswer,
      workingSource,
      workingFixtures,
      workingCompilation,
      tags,
      alsoReverse,
    },
    setters: {
      setAnswerMode,
      setFront,
      setBack,
      setNumericAnswer,
      setWorkingSource,
      setWorkingFixtures,
      setTags,
      setAlsoReverse,
      setDraftDirty,
    },
    currentDraftKey,
    editing,
    loaded,
    draftPrompt,
    formDirection,
    modifyDraftField,
    changeType,
    applyDraft,
    discardDraft,
    leaveForm,
    clearSavedDraft,
  };
}

export type CardEditorDraft = ReturnType<typeof useCardEditorDraft>;
